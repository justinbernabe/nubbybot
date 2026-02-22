import { getDb } from '../client.js';
import type { DbUserProfile } from '../../types/database.js';

export const profileRepository = {
  upsert(profile: {
    user_id: string;
    guild_id: string;
    summary?: string | null;
    personality_traits?: string[];
    favorite_games?: string[];
    favorite_topics?: string[];
    political_leanings?: string | null;
    allegiances?: Record<string, string>;
    communication_style?: string | null;
    activity_level?: string | null;
    sentiment_avg?: number | null;
    notable_quotes?: string[] | null;
    custom_traits?: Record<string, unknown>;
    raw_analysis?: string | null;
    message_count_analyzed?: number;
    last_analyzed_message_id?: string | null;
    confidence_score?: number;
  }): void {
    getDb().prepare(`
      INSERT INTO user_profiles (
        user_id, guild_id, summary, personality_traits, favorite_games,
        favorite_topics, political_leanings, allegiances, communication_style,
        activity_level, sentiment_avg, notable_quotes, custom_traits,
        raw_analysis, message_count_analyzed, last_analyzed_message_id, confidence_score
      ) VALUES (
        @user_id, @guild_id, @summary, @personality_traits, @favorite_games,
        @favorite_topics, @political_leanings, @allegiances, @communication_style,
        @activity_level, @sentiment_avg, @notable_quotes, @custom_traits,
        @raw_analysis, @message_count_analyzed, @last_analyzed_message_id, @confidence_score
      )
      ON CONFLICT(user_id, guild_id) DO UPDATE SET
        summary = excluded.summary,
        personality_traits = excluded.personality_traits,
        favorite_games = excluded.favorite_games,
        favorite_topics = excluded.favorite_topics,
        political_leanings = excluded.political_leanings,
        allegiances = excluded.allegiances,
        communication_style = excluded.communication_style,
        activity_level = excluded.activity_level,
        sentiment_avg = excluded.sentiment_avg,
        notable_quotes = excluded.notable_quotes,
        custom_traits = excluded.custom_traits,
        raw_analysis = excluded.raw_analysis,
        message_count_analyzed = excluded.message_count_analyzed,
        last_analyzed_message_id = excluded.last_analyzed_message_id,
        confidence_score = excluded.confidence_score,
        version = user_profiles.version + 1,
        analyzed_at = datetime('now'),
        updated_at = datetime('now')
    `).run({
      user_id: profile.user_id,
      guild_id: profile.guild_id,
      summary: profile.summary ?? null,
      personality_traits: JSON.stringify(profile.personality_traits ?? []),
      favorite_games: JSON.stringify(profile.favorite_games ?? []),
      favorite_topics: JSON.stringify(profile.favorite_topics ?? []),
      political_leanings: profile.political_leanings ?? null,
      allegiances: JSON.stringify(profile.allegiances ?? {}),
      communication_style: profile.communication_style ?? null,
      activity_level: profile.activity_level ?? null,
      sentiment_avg: profile.sentiment_avg ?? null,
      notable_quotes: JSON.stringify(profile.notable_quotes ?? []),
      custom_traits: JSON.stringify(profile.custom_traits ?? {}),
      raw_analysis: profile.raw_analysis ?? null,
      message_count_analyzed: profile.message_count_analyzed ?? 0,
      last_analyzed_message_id: profile.last_analyzed_message_id ?? null,
      confidence_score: profile.confidence_score ?? 0,
    });
  },

  findByUserAndGuild(userId: string, guildId: string): DbUserProfile | undefined {
    const row = getDb().prepare(`
      SELECT * FROM user_profiles WHERE user_id = ? AND guild_id = ?
    `).get(userId, guildId) as Record<string, unknown> | undefined;

    if (!row) return undefined;

    return {
      ...row,
      personality_traits: JSON.parse(row.personality_traits as string || '[]'),
      favorite_games: JSON.parse(row.favorite_games as string || '[]'),
      favorite_topics: JSON.parse(row.favorite_topics as string || '[]'),
      allegiances: JSON.parse(row.allegiances as string || '{}'),
      notable_quotes: JSON.parse(row.notable_quotes as string || '[]'),
      custom_traits: JSON.parse(row.custom_traits as string || '{}'),
    } as DbUserProfile;
  },

  findUsersNeedingProfiles(guildId: string, staleHours: number): Array<{ user_id: string; message_count: number }> {
    return getDb().prepare(`
      SELECT m.author_id AS user_id, COUNT(*) AS message_count
      FROM messages m
      JOIN users u ON u.id = m.author_id
      LEFT JOIN user_profiles p ON p.user_id = m.author_id AND p.guild_id = m.guild_id
      WHERE m.guild_id = @guild_id
        AND m.content != ''
        AND u.bot = 0
        AND (
          p.id IS NULL
          OR p.analyzed_at < datetime('now', '-' || @stale_hours || ' hours')
        )
      GROUP BY m.author_id
      HAVING COUNT(*) >= 10
      ORDER BY CASE WHEN p.id IS NULL THEN 0 ELSE 1 END ASC, message_count DESC
    `).all({ guild_id: guildId, stale_hours: staleHours }) as Array<{ user_id: string; message_count: number }>;
  },
};
