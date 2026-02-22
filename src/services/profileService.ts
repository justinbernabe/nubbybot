import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import { messageRepository } from '../database/repositories/messageRepository.js';
import { profileRepository } from '../database/repositories/profileRepository.js';
import { userRepository } from '../database/repositories/userRepository.js';
import { PROFILE_ANALYSIS_SYSTEM_PROMPT } from '../ai/promptTemplates.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/rateLimiter.js';

const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

export const profileService = {
  async buildProfile(userId: string, guildId: string): Promise<void> {
    logger.info(`Building profile for user ${userId} in guild ${guildId}`);

    const messages = messageRepository.getRecentByUser(userId, guildId, 500);
    if (messages.length < 10) {
      logger.info(`User ${userId} has fewer than 10 messages, skipping profile build.`);
      return;
    }

    const messageText = messages
      .map(m => `[${m.message_created_at}] ${m.content}`)
      .join('\n');

    const user = userRepository.findById(userId);
    const userName = (user?.global_display_name ?? user?.username ?? 'Unknown') as string;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      system: PROFILE_ANALYSIS_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Analyze these ${messages.length} messages from Discord user "${userName}":\n\n${messageText}`,
      }],
    });

    const responseText = response.content[0].type === 'text' ? response.content[0].text : '';

    let profileData: Record<string, unknown>;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found in response');
      profileData = JSON.parse(jsonMatch[0]);
    } catch {
      logger.error('Failed to parse profile analysis response', { responseText: responseText.substring(0, 200) });
      profileRepository.upsert({
        user_id: userId,
        guild_id: guildId,
        raw_analysis: responseText,
        message_count_analyzed: messages.length,
        last_analyzed_message_id: messages[0]?.id,
      });
      return;
    }

    profileRepository.upsert({
      user_id: userId,
      guild_id: guildId,
      summary: profileData.summary as string,
      personality_traits: profileData.personality_traits as string[],
      favorite_games: profileData.favorite_games as string[],
      favorite_topics: profileData.favorite_topics as string[],
      political_leanings: profileData.political_leanings as string,
      allegiances: profileData.allegiances as Record<string, string>,
      communication_style: profileData.communication_style as string,
      activity_level: profileData.activity_level as string,
      sentiment_avg: profileData.sentiment_avg as number,
      notable_quotes: profileData.notable_quotes as string[],
      custom_traits: profileData.custom_traits as Record<string, unknown>,
      confidence_score: profileData.confidence_score as number,
      raw_analysis: responseText,
      message_count_analyzed: messages.length,
      last_analyzed_message_id: messages[0]?.id,
    });

    logger.info(`Profile built for ${userName} (${userId}): ${messages.length} messages analyzed`);
  },

  async rebuildAllProfiles(guildId: string): Promise<void> {
    const userIds = messageRepository.getDistinctAuthorIds(guildId);
    logger.info(`Rebuilding profiles for ${userIds.length} users in guild ${guildId}`);

    for (const userId of userIds) {
      try {
        await this.buildProfile(userId, guildId);
        await delay(2000); // Rate limit Claude API calls
      } catch (err) {
        logger.error(`Failed to build profile for user ${userId}`, { error: err });
      }
    }
  },

  async getFormattedProfile(userId: string, guildId: string): Promise<string | null> {
    const profile = profileRepository.findByUserAndGuild(userId, guildId);
    if (!profile) return null;

    const user = userRepository.findById(userId);
    const name = (user?.global_display_name ?? user?.username ?? 'Unknown') as string;
    const nicknames = userRepository.getNicknames(userId, guildId);

    let text = `**${name}'s Profile**\n`;
    if (profile.summary) text += `> ${profile.summary}\n\n`;

    if (nicknames.length > 0) {
      const names = nicknames.map(n => n.nickname || n.display_name).filter(Boolean);
      if (names.length > 0) text += `**Also known as:** ${names.join(', ')}\n`;
    }

    if (profile.favorite_games.length > 0) {
      text += `**Favorite Games:** ${profile.favorite_games.join(', ')}\n`;
    }
    if (profile.favorite_topics.length > 0) {
      text += `**Favorite Topics:** ${profile.favorite_topics.join(', ')}\n`;
    }
    if (profile.personality_traits.length > 0) {
      text += `**Personality:** ${profile.personality_traits.join(', ')}\n`;
    }
    if (profile.communication_style) {
      text += `**Communication Style:** ${profile.communication_style}\n`;
    }
    if (profile.political_leanings && profile.political_leanings !== 'insufficient data') {
      text += `**Political Leanings:** ${profile.political_leanings}\n`;
    }
    if (profile.notable_quotes && profile.notable_quotes.length > 0) {
      text += `\n**Notable Quotes:**\n`;
      for (const quote of profile.notable_quotes.slice(0, 3)) {
        text += `> "${quote}"\n`;
      }
    }

    text += `\n*Based on ${profile.message_count_analyzed} messages (v${profile.version})*`;
    return text;
  },
};
