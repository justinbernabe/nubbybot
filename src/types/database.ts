export interface DbGuild {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string | null;
  member_count: number;
  joined_at: string;
  last_backfill_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbChannel {
  id: string;
  guild_id: string;
  name: string;
  type: number;
  topic: string | null;
  parent_id: string | null;
  position: number;
  is_nsfw: boolean;
  last_message_id: string | null;
  last_backfill_message_id: string | null;
  backfill_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface DbUser {
  id: string;
  username: string;
  discriminator: string;
  global_display_name: string | null;
  avatar_url: string | null;
  bot: boolean;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbUserNickname {
  id: string;
  user_id: string;
  guild_id: string;
  nickname: string | null;
  display_name: string | null;
  changed_at: string;
  created_at: string;
}

export interface DbMessage {
  id: string;
  guild_id: string;
  channel_id: string;
  author_id: string;
  content: string;
  clean_content: string | null;
  type: number;
  reference_message_id: string | null;
  is_pinned: boolean;
  has_attachments: boolean;
  has_embeds: boolean;
  embed_data: unknown;
  sticker_ids: string[] | null;
  reaction_data: unknown;
  edited_at: string | null;
  message_created_at: string;
  created_at: string;
}

export interface DbAttachment {
  id: string;
  message_id: string;
  filename: string;
  url: string;
  proxy_url: string | null;
  content_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface DbUserProfile {
  id: string;
  user_id: string;
  guild_id: string;
  summary: string | null;
  personality_traits: string[];
  favorite_games: string[];
  favorite_topics: string[];
  political_leanings: string | null;
  allegiances: Record<string, string>;
  communication_style: string | null;
  activity_level: string | null;
  sentiment_avg: number | null;
  notable_quotes: string[] | null;
  custom_traits: Record<string, unknown>;
  raw_analysis: string | null;
  message_count_analyzed: number;
  last_analyzed_message_id: string | null;
  confidence_score: number;
  version: number;
  analyzed_at: string;
  created_at: string;
  updated_at: string;
}

export interface DbBotQuery {
  id: string;
  guild_id: string;
  channel_id: string;
  asking_user_id: string;
  question: string;
  answer: string | null;
  context_tokens_used: number | null;
  response_tokens_used: number | null;
  model_used: string | null;
  response_time_ms: number | null;
  created_at: string;
}

export interface SearchMessageResult {
  id: string;
  channel_id: string;
  author_id: string;
  content: string;
  message_created_at: string;
  rank: number;
}

export interface UserMessageResult {
  id: string;
  channel_id: string;
  content: string;
  message_created_at: string;
}
