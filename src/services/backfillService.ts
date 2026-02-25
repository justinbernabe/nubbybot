import type { Client, TextChannel, NewsChannel, ForumChannel, VoiceChannel, ThreadChannel, Collection, Message } from 'discord.js';
import { ChannelType, SnowflakeUtil } from 'discord.js';
import { channelRepository } from '../database/repositories/channelRepository.js';
import { messageRepository } from '../database/repositories/messageRepository.js';
import { guildRepository } from '../database/repositories/guildRepository.js';
import { archiveService } from './archiveService.js';
import { config } from '../config.js';
import { delay, retryWithBackoff } from '../utils/rateLimiter.js';
import { logger } from '../utils/logger.js';

type BackfillableChannel = TextChannel | NewsChannel | VoiceChannel | ThreadChannel;

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

      const isTextLike = channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.GuildVoice;
      const isForum = channel.type === ChannelType.GuildForum;

      if (isTextLike) {
        try {
          const result = await this.backfillChannel(channel as BackfillableChannel, force);
          if (result.skipped) {
            stats.channelsSkipped++;
          } else {
            stats.channelsProcessed++;
            stats.totalMessages += result.messagesArchived;
          }
          // Also backfill threads within this channel (voice channels don't have threads)
          if (channel.type !== ChannelType.GuildVoice) {
            const threadMessages = await this.backfillThreads(channel as TextChannel | NewsChannel, force);
            stats.totalMessages += threadMessages;
          }
        } catch (err) {
          logger.error(`Failed to backfill channel #${channel.name} (${channelId})`, { error: err });
        }
      } else if (isForum) {
        // Forum channels only have threads, no channel-level messages
        try {
          const threadMessages = await this.backfillThreads(channel as ForumChannel, force);
          stats.totalMessages += threadMessages;
          if (threadMessages > 0) stats.channelsProcessed++;
        } catch (err) {
          logger.error(`Failed to backfill forum #${channel.name} (${channelId})`, { error: err });
        }
      }
    }

    guildRepository.updateBackfillTimestamp(guildId);
    logger.info(
      `Backfill complete for guild: ${guild.name} — ${stats.channelsProcessed} channels, ${stats.totalMessages} messages (${stats.channelsSkipped} skipped)`,
    );
    return stats;
  },

  async backfillChannel(channel: BackfillableChannel, force = false): Promise<{ skipped: boolean; messagesArchived: number }> {
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

    let beforeId: string | undefined = force ? undefined : (channelRecord?.last_backfill_message_id as string) || undefined;
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

  /** Backfill all threads (active + archived) within a channel or forum */
  async backfillThreads(channel: TextChannel | NewsChannel | ForumChannel, force: boolean): Promise<number> {
    let totalMessages = 0;

    // Active threads
    try {
      const active = await channel.threads.fetchActive();
      for (const [, thread] of active.threads) {
        try {
          const result = await this.backfillChannel(thread, force);
          if (!result.skipped) totalMessages += result.messagesArchived;
        } catch (err) {
          logger.warn(`Failed to backfill active thread "${thread.name}"`, { error: err });
        }
        await delay(config.bot.backfillBatchDelayMs);
      }
    } catch (err) {
      logger.warn(`Failed to fetch active threads for #${channel.name}`, { error: err });
    }

    // Archived threads (paginated)
    try {
      let hasMore = true;
      let beforeTimestamp: number | undefined;
      while (hasMore) {
        const archived = await channel.threads.fetchArchived({ before: beforeTimestamp ? new Date(beforeTimestamp) : undefined, limit: 100 });
        for (const [, thread] of archived.threads) {
          try {
            const result = await this.backfillChannel(thread, force);
            if (!result.skipped) totalMessages += result.messagesArchived;
          } catch (err) {
            logger.warn(`Failed to backfill archived thread "${thread.name}"`, { error: err });
          }
          await delay(config.bot.backfillBatchDelayMs);
        }
        hasMore = archived.hasMore ?? false;
        if (archived.threads.size > 0) {
          const oldest = archived.threads.last();
          if (oldest?.archiveTimestamp) {
            beforeTimestamp = oldest.archiveTimestamp;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
    } catch (err) {
      logger.warn(`Failed to fetch archived threads for #${channel.name}`, { error: err });
    }

    if (totalMessages > 0) {
      logger.info(`[Backfill] Threads in #${channel.name}: ${totalMessages} messages archived`);
    }
    return totalMessages;
  },

  /** Catch up on missed messages in a single channel/thread */
  async catchUpChannel(channel: BackfillableChannel): Promise<number> {
    const latestId = messageRepository.getLatestMessageId(channel.id);
    if (!latestId) return 0;

    let afterId: string = latestId;
    let count = 0;

    while (true) {
      const messages = await retryWithBackoff(
        () => channel.messages.fetch({ limit: 100, after: afterId }),
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

      count += messages.size;
      // messages.fetch with `after` returns newest first, so first() is the newest
      const newest = messages.first();
      if (newest) afterId = newest.id;

      await delay(config.bot.backfillBatchDelayMs);
    }

    return count;
  },

  /** Catch up on threads (active + archived) within a channel */
  async catchUpThreads(channel: TextChannel | NewsChannel | ForumChannel): Promise<number> {
    let total = 0;

    // Active threads
    try {
      const active = await channel.threads.fetchActive();
      for (const [, thread] of active.threads) {
        try {
          const count = await this.catchUpChannel(thread);
          total += count;
          if (count > 0) {
            logger.info(`[Catch-up] Thread "${thread.name}": ${count} missed messages`);
          }
        } catch (err) {
          logger.warn(`[Catch-up] Failed for active thread "${thread.name}"`, { error: err });
        }
      }
    } catch (err) {
      logger.warn(`[Catch-up] Failed to fetch active threads for #${channel.name}`, { error: err });
    }

    // Archived threads (paginated)
    try {
      let hasMore = true;
      let beforeTimestamp: number | undefined;
      while (hasMore) {
        const archived = await channel.threads.fetchArchived({ before: beforeTimestamp ? new Date(beforeTimestamp) : undefined, limit: 100 });
        for (const [, thread] of archived.threads) {
          try {
            const count = await this.catchUpChannel(thread);
            total += count;
            if (count > 0) {
              logger.info(`[Catch-up] Archived thread "${thread.name}": ${count} missed messages`);
            }
          } catch (err) {
            logger.warn(`[Catch-up] Failed for archived thread "${thread.name}"`, { error: err });
          }
        }
        hasMore = archived.hasMore ?? false;
        if (archived.threads.size > 0) {
          const oldest = archived.threads.last();
          if (oldest?.archiveTimestamp) {
            beforeTimestamp = oldest.archiveTimestamp;
          } else {
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
    } catch (err) {
      logger.warn(`[Catch-up] Failed to fetch archived threads for #${channel.name}`, { error: err });
    }

    return total;
  },

  /** Catch up on messages missed while the bot was offline */
  async catchUp(client: Client<true>, guildId: string): Promise<void> {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channels = await guild.channels.fetch();
    let totalCaughtUp = 0;

    for (const [, channel] of channels) {
      if (!channel) continue;

      const isTextLike = channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.GuildVoice;
      const isForum = channel.type === ChannelType.GuildForum;

      if (!isTextLike && !isForum) continue;

      const channelRecord = channelRepository.findById(channel.id);

      // New channel we've never seen — queue a full backfill
      if (!channelRecord) {
        if (isTextLike) {
          logger.info(`[Catch-up] New channel #${channel.name} — running initial backfill`);
          try {
            const result = await this.backfillChannel(channel as BackfillableChannel, false);
            totalCaughtUp += result.messagesArchived;
            if (channel.type !== ChannelType.GuildVoice) {
              totalCaughtUp += await this.backfillThreads(channel as TextChannel | NewsChannel, false);
            }
          } catch (err) {
            logger.warn(`[Catch-up] Initial backfill failed for #${channel.name}`, { error: err });
          }
        } else if (isForum) {
          logger.info(`[Catch-up] New forum #${channel.name} — running initial backfill`);
          try {
            totalCaughtUp += await this.backfillThreads(channel as ForumChannel, false);
          } catch (err) {
            logger.warn(`[Catch-up] Initial backfill failed for forum #${channel.name}`, { error: err });
          }
        }
        continue;
      }

      // Incomplete backfill — resume it instead of skipping
      if (!channelRecord.backfill_complete && isTextLike) {
        logger.info(`[Catch-up] Resuming incomplete backfill for #${channel.name}`);
        try {
          const result = await this.backfillChannel(channel as BackfillableChannel, false);
          totalCaughtUp += result.messagesArchived;
        } catch (err) {
          logger.warn(`[Catch-up] Resume backfill failed for #${channel.name}`, { error: err });
        }
      }

      // Catch up on new messages in the channel itself
      if (isTextLike) {
        try {
          const count = await this.catchUpChannel(channel as BackfillableChannel);
          if (count > 0) {
            totalCaughtUp += count;
            logger.info(`[Catch-up] #${channel.name}: ${count} missed messages archived`);
          }
        } catch (err) {
          logger.warn(`[Catch-up] Failed for #${channel.name}`, { error: err });
        }
      }

      // Catch up on threads (text, announcement, and forum channels)
      if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement || isForum) {
        try {
          const threadCount = await this.catchUpThreads(channel as TextChannel | NewsChannel | ForumChannel);
          if (threadCount > 0) {
            totalCaughtUp += threadCount;
          }
        } catch (err) {
          logger.warn(`[Catch-up] Thread catch-up failed for #${channel.name}`, { error: err });
        }
      }
    }

    if (totalCaughtUp > 0) {
      logger.info(`[Catch-up] Complete — ${totalCaughtUp} missed messages archived across guild ${guild.name}`);
    } else {
      logger.info(`[Catch-up] No missed messages for guild ${guild.name}`);
    }
  },
};
