import type { Client, TextChannel, NewsChannel, Collection, Message } from 'discord.js';
import { ChannelType } from 'discord.js';
import { channelRepository } from '../database/repositories/channelRepository.js';
import { guildRepository } from '../database/repositories/guildRepository.js';
import { archiveService } from './archiveService.js';
import { config } from '../config.js';
import { delay } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

type TextBasedGuildChannel = TextChannel | NewsChannel;

export const backfillService = {
  async backfillGuild(client: Client<true>, guildId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
      logger.error(`Guild ${guildId} not found in cache`);
      return;
    }

    logger.info(`Starting backfill for guild: ${guild.name} (${guildId})`);

    const channels = await guild.channels.fetch();

    for (const [channelId, channel] of channels) {
      if (!channel) continue;
      if (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement
      ) {
        try {
          await this.backfillChannel(channel as TextBasedGuildChannel);
        } catch (err) {
          logger.error(`Failed to backfill channel #${channel.name} (${channelId})`, { error: err });
        }
      }
    }

    guildRepository.updateBackfillTimestamp(guildId);
    logger.info(`Backfill complete for guild: ${guild.name}`);
  },

  async backfillChannel(channel: TextBasedGuildChannel): Promise<void> {
    const channelRecord = channelRepository.findById(channel.id);
    if (channelRecord?.backfill_complete) {
      logger.info(`Channel #${channel.name} already backfilled, skipping.`);
      return;
    }

    logger.info(`Backfilling channel: #${channel.name} (${channel.id})`);

    let beforeId: string | undefined = channelRecord?.last_backfill_message_id as string | undefined;
    let totalArchived = 0;
    let batchNumber = 0;
    let lastStatusLog = Date.now();

    while (true) {
      batchNumber++;
      const fetchOptions: { limit: number; before?: string } = { limit: 100 };
      if (beforeId) fetchOptions.before = beforeId;

      let messages: Collection<string, Message>;
      try {
        messages = await channel.messages.fetch(fetchOptions);
      } catch (err) {
        logger.error(`Failed to fetch messages for #${channel.name}, batch ${batchNumber}`, { error: err });
        break;
      }

      if (messages.size === 0) {
        channelRepository.update(channel.id, { backfill_complete: true });
        logger.info(`Channel #${channel.name} backfill complete. Total: ${totalArchived} messages.`);
        break;
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

      // Log progress every 15 seconds
      const now = Date.now();
      if (now - lastStatusLog >= 15000) {
        const oldestDate = oldestMessage.createdAt.toISOString().split('T')[0];
        logger.info(
          `[Backfill] #${channel.name}: ${totalArchived} messages archived (batch ${batchNumber}, reached ${oldestDate})`,
        );
        lastStatusLog = now;
      }

      await delay(config.bot.backfillBatchDelayMs);
    }
  },
};
