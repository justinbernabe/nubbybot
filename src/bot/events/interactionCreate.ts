import { type Interaction, PermissionFlagsBits } from 'discord.js';
import { backfillService } from '../../services/backfillService.js';
import { profileService } from '../../services/profileService.js';
import { queryHandler } from '../../ai/queryHandler.js';
import { logger } from '../../utils/logger.js';

export async function onInteractionCreate(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'backfill') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: 'Only admins can run backfill.', ephemeral: true });
      return;
    }

    await interaction.deferReply();
    logger.info(`Backfill triggered by ${interaction.user.username}`);

    try {
      const stats = await backfillService.backfillGuild(interaction.client, interaction.guildId!);
      const parts: string[] = [];
      if (stats.channelsProcessed > 0) {
        parts.push(`Backfilled **${stats.channelsProcessed}** channel(s) — **${stats.totalMessages.toLocaleString()}** messages archived.`);
      }
      if (stats.channelsSkipped > 0) {
        parts.push(`${stats.channelsSkipped} channel(s) already complete, skipped.`);
      }
      if (parts.length === 0) {
        parts.push('No channels needed backfilling.');
      }
      await interaction.editReply(parts.join('\n')).catch(() => {
        logger.warn('Backfill reply failed (interaction token likely expired)');
      });
    } catch (err) {
      logger.error('Backfill failed', { error: err });
      await interaction.editReply('Backfill encountered errors. Check the logs.').catch(() => {});
    }
    return;
  }

  if (commandName === 'profile') {
    const targetUser = interaction.options.getUser('user', true);
    const rebuild = interaction.options.getBoolean('rebuild') ?? false;

    await interaction.deferReply();

    try {
      if (rebuild) {
        await profileService.buildProfile(targetUser.id, interaction.guildId!);
      }

      const profile = await profileService.getFormattedProfile(targetUser.id, interaction.guildId!);
      await interaction.editReply(profile || `No profile data yet for ${targetUser.displayName}. Try \`/profile @user rebuild:true\` to generate one.`);
    } catch (err) {
      logger.error('Profile command failed', { error: err });
      await interaction.editReply('Failed to fetch profile. Try again later.');
    }
    return;
  }

  if (commandName === 'ask') {
    const question = interaction.options.getString('question', true);

    await interaction.deferReply();

    try {
      const answer = await queryHandler.answerQuestion(question, interaction.guildId!, interaction.channelId, []);
      await interaction.editReply(answer);
    } catch (err) {
      logger.error('Ask command failed', { error: err });
      await interaction.editReply('Failed to process your question. Try again later.');
    }
    return;
  }
}
