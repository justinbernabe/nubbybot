import type { Client } from 'discord.js';
import { Events } from 'discord.js';
import { onReady } from './ready.js';
import { onMessageCreate } from './messageCreate.js';
import { onMessageUpdate } from './messageUpdate.js';
import { onGuildMemberUpdate } from './guildMemberUpdate.js';
import { onUserUpdate } from './userUpdate.js';
import { onInteractionCreate } from './interactionCreate.js';

export function registerEvents(client: Client): void {
  client.once(Events.ClientReady, onReady);
  client.on(Events.MessageCreate, onMessageCreate);
  client.on(Events.MessageUpdate, onMessageUpdate);
  client.on(Events.GuildMemberUpdate, onGuildMemberUpdate);
  client.on(Events.UserUpdate, onUserUpdate);
  client.on(Events.InteractionCreate, onInteractionCreate);
}
