import type { Message } from 'discord.js';
import { archiveService } from '../../services/archiveService.js';
import { linkAnalysisService } from '../../services/linkAnalysisService.js';
import { queryHandler } from '../../ai/queryHandler.js';
import { followUpTracker } from '../../ai/followUpTracker.js';
import { feedbackDetector } from '../../ai/feedbackDetector.js';
import { messageRepository } from '../../database/repositories/messageRepository.js';
import { createMessageWithRetry } from '../../ai/claude.js';
import { config } from '../../config.js';
import { logger } from '../../utils/logger.js';

const GOOD_BOT_PATTERN = /good\s*bot/i;
const KEYWORD_TRIGGER_PATTERN = /\b(nubby|nubbybot)\b/i;
const KEYWORD_BOT_PATTERN = /\bbot\b/i;

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

    // "Good bot" reaction — lightweight, no API cost
    if (!message.author.bot && GOOD_BOT_PATTERN.test(message.content)) {
      try {
        const recent = messageRepository.getRecentByChannel(message.channel.id, 5);
        const botRepliedRecently = recent.some(m => m.author_id === message.client.user!.id);
        if (botRepliedRecently) {
          await message.react('😊').catch(() => {});
        }
      } catch {
        // ignore reaction failures
      }
    }

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

    // Keyword triggers: "nubby" or "bot" — check if they're addressing the bot
    if (!message.author.bot && !message.mentions.has(message.client.user!) && message.content.trim().length > 0 && message.content.length <= 300) {
      const isDirectKeyword = KEYWORD_TRIGGER_PATTERN.test(message.content); // "nubby" is almost always about the bot
      const isBotKeyword = KEYWORD_BOT_PATTERN.test(message.content);

      if (isDirectKeyword || isBotKeyword) {
        try {
          const confident = await classifyBotReference(message, isDirectKeyword);
          if (confident) {
            logger.info(`Keyword trigger from ${message.author.username}: "${message.content.substring(0, 80)}"`);
            await queryHandler.handleMention(message);
            return;
          }
        } catch (err) {
          logger.warn('Keyword trigger classification failed', { error: err });
        }
      }
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
        } else {
          // Not a follow-up — check if it's feedback about a recent bot reply (background, no await)
          checkFeedbackInBackground(message);
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

function checkFeedbackInBackground(message: Message): void {
  if (!message.guild) return;

  // Find the bot's most recent reply in the last 5 messages
  const recent = messageRepository.getRecentByChannel(message.channel.id, 5);
  const botReply = recent.find(m => m.author_id === message.client.user!.id);
  if (!botReply) return;

  const botResponse = botReply.content as string;
  if (!botResponse) return;

  feedbackDetector.checkForFeedback(
    message.client as import('discord.js').Client<true>,
    message.guild.id,
    message.channel.id,
    message.author.id,
    message.author.displayName,
    botResponse,
    message.content,
  ).catch(err => {
    logger.error('Feedback detection failed', { error: err });
  });
}

async function classifyBotReference(message: Message, isDirectKeyword: boolean): Promise<boolean> {
  // "nubby" or "nubbybot" is almost always about the bot — 80% baseline
  if (isDirectKeyword) return true;

  // For just "bot", use Haiku to check if they mean the Discord bot
  const recent = messageRepository.getRecentByChannel(message.channel.id, 5);
  const recentContext = recent.reverse().map(m =>
    `${(m.global_display_name ?? m.username) as string}: ${m.content as string}`
  ).join('\n');

  const response = await createMessageWithRetry({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 10,
    system: 'You classify Discord messages. The server has a bot called NubbyBot/NubbyGPT. Answer ONLY "yes" or "no".',
    messages: [{
      role: 'user',
      content: `Recent chat:\n${recentContext}\n\nNew message from ${message.author.displayName}: "${message.content}"\n\nIs this user talking to or about the NubbyBot Discord bot (not bots in general, not game bots)?`,
    }],
  }, 'keyword_classify');

  const answer = response.content[0].type === 'text' ? response.content[0].text.trim().toLowerCase() : 'no';
  return answer === 'yes';
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
