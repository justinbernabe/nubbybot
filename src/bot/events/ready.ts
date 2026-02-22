import type { Client } from 'discord.js';
import { ChannelType } from 'discord.js';
import { logger } from '../../utils/logger.js';
import { guildRepository } from '../../database/repositories/guildRepository.js';
import { channelRepository } from '../../database/repositories/channelRepository.js';

export async function onReady(client: Client<true>): Promise<void> {
  logger.info(`Logged in as ${client.user.tag}! Serving ${client.guilds.cache.size} guild(s).`);

  for (const [guildId, guild] of client.guilds.cache) {
    guildRepository.upsert({
      id: guildId,
      name: guild.name,
      icon_url: guild.iconURL(),
      owner_id: guild.ownerId,
      member_count: guild.memberCount,
    });

    const channels = await guild.channels.fetch();
    for (const [channelId, channel] of channels) {
      if (!channel) continue;
      if (
        channel.type === ChannelType.GuildText ||
        channel.type === ChannelType.GuildAnnouncement ||
        channel.type === ChannelType.GuildForum
      ) {
        channelRepository.upsert({
          id: channelId,
          guild_id: guildId,
          name: channel.name,
          type: channel.type,
          topic: 'topic' in channel ? (channel.topic ?? null) : null,
          parent_id: channel.parentId,
          position: 'position' in channel ? channel.position : 0,
          is_nsfw: 'nsfw' in channel ? channel.nsfw : false,
        });
      }
    }
  }

  logger.info('Guild and channel sync complete.');
}
