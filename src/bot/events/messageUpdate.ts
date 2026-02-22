import type { Message, PartialMessage } from 'discord.js';
import { archiveService } from '../../services/archiveService.js';
import { logger } from '../../utils/logger.js';

export async function onMessageUpdate(
  _oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage,
): Promise<void> {
  if (!newMessage.guild) return;

  try {
    // Fetch the full message if it's partial (uncached)
    const full = newMessage.partial ? await newMessage.fetch() : newMessage;
    archiveService.archiveMessage(full);
  } catch (err) {
    logger.error('Failed to update archived message', { messageId: newMessage.id, error: err });
  }
}
