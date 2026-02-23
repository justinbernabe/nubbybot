import type { Message } from 'discord.js';
import { archiveService } from '../../services/archiveService.js';
import { linkAnalysisService } from '../../services/linkAnalysisService.js';
import { queryHandler } from '../../ai/queryHandler.js';
import { followUpTracker } from '../../ai/followUpTracker.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

export async function onMessageCreate(message: Message): Promise<void> {
  // Guild messages: archive + link analysis + query handling
  if (message.guild) {
    // Archive every non-bot message (or our own bot messages)
    try {
      archiveService.archiveMessage(message);
    } catch (err) {
      logger.error('Failed to archive message', { messageId: message.id, error: err });
    }

    // Analyze any links in the message (runs in background)
    linkAnalysisService.analyzeMessageLinks(message).catch((err) => {
      logger.error('Link analysis failed', { messageId: message.id, error: err });
    });

    // Channel lock: only respond in allowed channels (if configured)
    const allowed = config.bot.allowedChannelIds;
    if (allowed.length > 0 && !allowed.includes(message.channel.id)) return;

    // Handle @mentions to the bot
    if (message.mentions.has(message.client.user!) && !message.author.bot) {
      try {
        await queryHandler.handleMention(message);
      } catch (err) {
        logger.error('Failed to handle mention', { messageId: message.id, error: err });
        await message.reply('Sorry, I hit an error processing your question. Try again?').catch(() => {});
      }
      return;
    }

    // Check for follow-up messages (no @mention required)
    if (!message.author.bot && message.content.trim().length > 0) {
      try {
        const result = await followUpTracker.checkFollowUp(
          message.channel.id,
          message.author.id,
          message.content,
        );

        if (result) {
          logger.info(`Follow-up detected from ${message.author.username} in ${message.channel.id}`);
          await queryHandler.handleFollowUp(message, result.window.history);
        }
      } catch (err) {
        logger.error('Follow-up check failed', { messageId: message.id, error: err });
      }
    }
    return;
  }

  // DM messages: respond only to authorized users
  if (!message.author.bot) {
    const userId = message.author.id;
    const isOwner = config.bot.ownerUserId === userId;
    const isAllowed = config.bot.allowedDmUserIds.length === 0 || config.bot.allowedDmUserIds.includes(userId);
    if (isOwner || isAllowed) {
      await handleDmMessage(message);
    }
  }
}

async function handleDmMessage(message: Message): Promise<void> {
  const guildId = queryHandler.getPrimaryGuildId();
  if (!guildId) {
    await message.reply("I'm not connected to any server yet. Can't help without data.").catch(() => {});
    return;
  }

  try {
    // Check for follow-ups first (DM channels have unique IDs per user)
    const followUp = await followUpTracker.checkFollowUp(
      message.channel.id,
      message.author.id,
      message.content,
    );

    if (followUp) {
      logger.info(`DM follow-up detected from ${message.author.username}`);
      await queryHandler.handleDmFollowUp(message, guildId, followUp.window.history);
      return;
    }

    await queryHandler.handleDm(message, guildId);
  } catch (err) {
    logger.error('Failed to handle DM', { messageId: message.id, error: err });
    await message.reply('Something broke. Try again.').catch(() => {});
  }
}
