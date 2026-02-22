import type { GuildMember, PartialGuildMember } from 'discord.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { logger } from '../../utils/logger.js';

export async function onGuildMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  if (oldMember.nickname === newMember.nickname) return;

  logger.info(
    `Nickname change for ${newMember.user.username} in ${newMember.guild.name}: ` +
    `"${oldMember.nickname}" -> "${newMember.nickname}"`,
  );

  userRepository.addNickname(
    newMember.id,
    newMember.guild.id,
    newMember.nickname,
    newMember.displayName,
  );
}
