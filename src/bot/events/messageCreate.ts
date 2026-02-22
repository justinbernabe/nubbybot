import type { Message } from 'discord.js';
import { archiveService } from '../../services/archiveService.js';
import { linkAnalysisService } from '../../services/linkAnalysisService.js';
import { queryHandler } from '../../ai/queryHandler.js';
import { logger } from '../../utils/logger.js';

export async function onMessageCreate(message: Message): Promise<void> {
  if (!message.guild) return;

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

  // Handle @mentions to the bot
  if (message.mentions.has(message.client.user!) && !message.author.bot) {
    try {
      await queryHandler.handleMention(message);
    } catch (err) {
      logger.error('Failed to handle mention', { messageId: message.id, error: err });
      await message.reply('Sorry, I hit an error processing your question. Try again?').catch(() => {});
    }
  }
}
