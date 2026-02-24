import type { Message } from 'discord.js';
import { messageRepository } from '../database/repositories/messageRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { channelRepository } from '../database/repositories/channelRepository.js';

export const archiveService = {
  archiveMessage(message: Message): void {
    if (!message.guild) return;

    // Ensure channel exists
    channelRepository.upsert({
      id: message.channel.id,
      guild_id: message.guild.id,
      name: 'name' in message.channel ? (message.channel.name ?? 'unknown') : 'unknown',
      type: message.channel.type,
      topic: 'topic' in message.channel ? (message.channel.topic ?? null) : null,
      parent_id: 'parentId' in message.channel ? (message.channel.parentId ?? null) : null,
      position: 'position' in message.channel ? message.channel.position : 0,
      is_nsfw: 'nsfw' in message.channel ? message.channel.nsfw : false,
    });

    // Ensure user exists
    userRepository.upsert({
      id: message.author.id,
      username: message.author.username,
      discriminator: message.author.discriminator,
      global_display_name: message.author.globalName,
      avatar_url: message.author.displayAvatarURL(),
      bot: message.author.bot,
    });

    // Archive the message
    messageRepository.upsert({
      id: message.id,
      guild_id: message.guild.id,
      channel_id: message.channel.id,
      author_id: message.author.id,
      content: message.content,
      clean_content: message.cleanContent,
      type: message.type,
      reference_message_id: message.reference?.messageId ?? null,
      is_pinned: message.pinned,
      has_attachments: message.attachments.size > 0,
      has_embeds: message.embeds.length > 0,
      embed_data: message.embeds.length > 0 ? message.embeds.map(e => e.toJSON()) : null,
      sticker_ids: message.stickers.size > 0 ? [...message.stickers.keys()] : null,
      edited_at: message.editedAt?.toISOString() ?? null,
      message_created_at: message.createdAt.toISOString(),
    });

    // Archive attachments
    for (const [attachmentId, attachment] of message.attachments) {
      messageRepository.upsertAttachment({
        id: attachmentId,
        message_id: message.id,
        filename: attachment.name,
        url: attachment.url,
        proxy_url: attachment.proxyURL,
        content_type: attachment.contentType,
        size_bytes: attachment.size,
        width: attachment.width,
        height: attachment.height,
      });
    }
  },
};
