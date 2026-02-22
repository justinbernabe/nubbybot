import type { User, PartialUser } from 'discord.js';
import { userRepository } from '../../database/repositories/userRepository.js';
import { logger } from '../../utils/logger.js';

export async function onUserUpdate(oldUser: User | PartialUser, newUser: User): Promise<void> {
  if (oldUser.username === newUser.username && oldUser.globalName === newUser.globalName) {
    return;
  }

  logger.info(
    `User update: "${oldUser.username}" (${oldUser.globalName}) -> ` +
    `"${newUser.username}" (${newUser.globalName})`,
  );

  userRepository.upsert({
    id: newUser.id,
    username: newUser.username,
    global_display_name: newUser.globalName,
    avatar_url: newUser.displayAvatarURL(),
  });
}
