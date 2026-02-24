import type { Client, TextChannel, NewsChannel, Collection, Message } from 'discord.js';
import { ChannelType, SnowflakeUtil } from 'discord.js';
import { channelRepository } from '../database/repositories/channelRepository.js';
import { messageRepository } from '../database/repositories/messageRepository.js';
import { guildRepository } from '../database/repositories/guildRepository.js';
import { archiveService } from './archiveService.js';
import { config } from '../config.js';
import { delay, retryWithBackoff } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

type TextBasedGuildChannel = TextChannel | NewsChannel;

export interface BackfillStats {
  channelsProcessed: number;
  channelsSkipped: number;
  totalMessages: number;
}

/** Extract timestamp (ms) from a Discord snowflake ID */
function snowflakeToTimestamp(id: string): number {
  return Number(SnowflakeUtil.timestampFrom(id));
}

export const backfillService = {
  async backfillGuild(client: Client<true>, guildId: string, force = false): Promise<BackfillStats> {
    const stats: BackfillStats = { channelsProcessed: 0, channelsSkipped: 0, totalMessages: 0 };
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.error(`Guild ${guildId} not found in cache`);
      return stats;
    }

    logger.info(`Starting backfill for guild: ${guild.name} (${guildId})${force ? ' [FORCE REPROCESS]' : ''}`);

    const channels = await guild.channels.fetch();

    for (const [channelId, channel] of channels) {
      if (!channel) continue;
      if (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement
      ) {
        try {
          const result = await this.backfillChannel(channel as TextBasedGuildChannel, force);
          if (result.skipped) {
            stats.channelsSkipped++;
          } else {
            stats.channelsProcessed++;
            stats.totalMessages += result.messagesArchived;
          }
        } catch (err) {
          logger.error(`Failed to backfill channel #${channel.name} (${channelId})`, { error: err });
        }
      }
    }

    guildRepository.updateBackfillTimestamp(guildId);
    logger.info(
      `Backfill complete for guild: ${guild.name} — ${stats.channelsProcessed} channels, ${stats.totalMessages} messages (${stats.channelsSkipped} skipped)`,
    );
    return stats;
  },

  async backfillChannel(channel: TextBasedGuildChannel, force = false): Promise<{ skipped: boolean; messagesArchived: number }> {
    const channelRecord = channelRepository.findById(channel.id);
    if (channelRecord?.backfill_complete && !force) {
      logger.info(`Channel #${channel.name} already backfilled, skipping.`);
      return { skipped: true, messagesArchived: 0 };
    }

    // Force reprocess: reset progress so we re-fetch from the newest message
    if (force) {
      channelRepository.update(channel.id, { backfill_complete: false, last_backfill_message_id: null });
      logger.info(`Channel #${channel.name} reset for force reprocess (starting from newest).`);
    }

    logger.info(`Backfilling channel: #${channel.name} (${channel.id})`);

    // For progress %, get the time range: channel creation → newest message
    const channelCreatedTs = snowflakeToTimestamp(channel.id);
    let newestTs = Date.now();

    let beforeId: string | undefined = (channelRecord?.last_backfill_message_id as string) || undefined;
    let totalArchived = 0;
    let batchNumber = 0;
    let lastStatusLog = Date.now();

    while (true) {
      batchNumber++;
      const fetchOptions: { limit: number; before?: string } = { limit: 100 };
      if (beforeId) fetchOptions.before = beforeId;

      let messages: Collection<string, Message>;
      try {
        messages = await retryWithBackoff(
          () => channel.messages.fetch(fetchOptions),
          `Fetch #${channel.name} batch ${batchNumber}`,
        );
      } catch (err) {
        logger.error(`Failed to fetch messages for #${channel.name}, batch ${batchNumber} after retries`, { error: err });
        break;
      }

      if (messages.size === 0) {
        channelRepository.update(channel.id, { backfill_complete: true });
        logger.info(`[Backfill] #${channel.name} complete — ${totalArchived} messages archived.`);
        break;
      }

      // Capture the newest message timestamp on first batch for progress calculation
      if (batchNumber === 1 && !beforeId) {
        const first = messages.first();
        if (first) newestTs = first.createdTimestamp;
      }

      for (const [, message] of messages) {
        try {
          archiveService.archiveMessage(message);
        } catch (err) {
          logger.warn(`Failed to archive message ${message.id} during backfill`, { error: err });
        }
      }

      totalArchived += messages.size;

      const oldestMessage = messages.last()!;
      beforeId = oldestMessage.id;

      // Save progress so we can resume if interrupted
      channelRepository.update(channel.id, { last_backfill_message_id: beforeId });

      // Log progress every 15 seconds with percentage
      const now = Date.now();
      if (now - lastStatusLog >= 15000) {
        const oldestTs = oldestMessage.createdTimestamp;
        const totalRange = newestTs - channelCreatedTs;
        const coveredRange = newestTs - oldestTs;
        const pct = totalRange > 0 ? Math.min(100, Math.round((coveredRange / totalRange) * 100)) : 100;
        const oldestDate = oldestMessage.createdAt.toISOString().split('T')[0];
        logger.info(
          `[Backfill] #${channel.name}: ${pct}% | ${totalArchived} messages (batch ${batchNumber}, reached ${oldestDate})`,
        );
        lastStatusLog = now;
      }

      await delay(config.bot.backfillBatchDelayMs);
    }

    return { skipped: false, messagesArchived: totalArchived };
  },

  /** Catch up on messages missed while the bot was offline */
  async catchUp(client: Client<true>, guildId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channels = await guild.channels.fetch();
    let totalCaughtUp = 0;

    for (const [, channel] of channels) {
      if (!channel) continue;
      if (
        channel.type !== ChannelType.GuildText &&
        channel.type !== ChannelType.GuildAnnouncement
      ) continue;

      const channelRecord = channelRepository.findById(channel.id);
      if (!channelRecord?.backfill_complete) continue;

      // Find the latest message we have for this channel
      const latestId = messageRepository.getLatestMessageId(channel.id);
      if (!latestId) continue;

      try {
        const textChannel = channel as TextBasedGuildChannel;
        let afterId: string = latestId;
        let channelCatchUp = 0;

        while (true) {
          const messages = await retryWithBackoff(
            () => textChannel.messages.fetch({ limit: 100, after: afterId }),
            `Catch-up #${channel.name}`,
          );

          if (messages.size === 0) break;

          for (const [, message] of messages) {
            try {
              archiveService.archiveMessage(message);
            } catch {
              // skip individual failures
            }
          }

          channelCatchUp += messages.size;
          // messages.fetch with `after` returns newest first, so last() is the newest
          const newest = messages.first();
          if (newest) afterId = newest.id;

          await delay(config.bot.backfillBatchDelayMs);
        }

        if (channelCatchUp > 0) {
          totalCaughtUp += channelCatchUp;
          logger.info(`[Catch-up] #${channel.name}: ${channelCatchUp} missed messages archived`);
        }
      } catch (err) {
        logger.warn(`[Catch-up] Failed for #${channel.name}`, { error: err });
      }
    }

    if (totalCaughtUp > 0) {
      logger.info(`[Catch-up] Complete — ${totalCaughtUp} missed messages archived across guild ${guild.name}`);
    } else {
      logger.info(`[Catch-up] No missed messages for guild ${guild.name}`);
    }
  },
};
