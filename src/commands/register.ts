import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from '../config.js';

const commands = [
  new SlashCommandBuilder()
    .setName('backfill')
    .setDescription('Archive all historical messages from server channels (admin only)')
    .addBooleanOption(option =>
      option.setName('force').setDescription('Force reprocess all channels, even already-backfilled ones').setRequired(false),
    )
    .setDefaultMemberPermissions('0')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View or rebuild a user profile')
    .addUserOption(option =>
      option.setName('user').setDescription('The user to profile').setRequired(true),
    )
    .addBooleanOption(option =>
      option.setName('rebuild').setDescription('Force rebuild the profile with AI').setRequired(false),
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask NubbyGPT a question about the server')
    .addStringOption(option =>
      option.setName('question').setDescription('Your question').setRequired(true),
    )
    .toJSON(),
];

const rest = new REST({ version: '10' }).setToken(config.discord.token);

async function registerCommands() {
  console.log('Registering slash commands...');
  await rest.put(
    Routes.applicationCommands(config.discord.appId),
    { body: commands },
  );
  console.log('Slash commands registered successfully!');
}

registerCommands().catch(console.error);
