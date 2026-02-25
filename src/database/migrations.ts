import type Database from 'better-sqlite3';
import { logger } from '../utils/logger.js';

export function runMigrations(db: Database.Database): void {
  logger.info('Running database migrations...');

  db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon_url TEXT,
      owner_id TEXT,
      member_count INTEGER DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now')),
      last_backfill_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type INTEGER NOT NULL,
      topic TEXT,
      parent_id TEXT,
      position INTEGER DEFAULT 0,
      is_nsfw INTEGER DEFAULT 0,
      last_message_id TEXT,
      last_backfill_message_id TEXT,
      backfill_complete INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_channels_guild_id ON channels(guild_id);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      discriminator TEXT DEFAULT '0',
      global_display_name TEXT,
      avatar_url TEXT,
      bot INTEGER DEFAULT 0,
      first_seen_at TEXT DEFAULT (datetime('now')),
      last_seen_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_nicknames (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      nickname TEXT,
      display_name TEXT,
      changed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_user_nicknames_user_guild ON user_nicknames(user_id, guild_id);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL DEFAULT '',
      clean_content TEXT,
      type INTEGER DEFAULT 0,
      reference_message_id TEXT,
      is_pinned INTEGER DEFAULT 0,
      has_attachments INTEGER DEFAULT 0,
      has_embeds INTEGER DEFAULT 0,
      embed_data TEXT,
      sticker_ids TEXT,
      reaction_data TEXT,
      edited_at TEXT,
      message_created_at TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
    CREATE INDEX IF NOT EXISTS idx_messages_author_id ON messages(author_id);
    CREATE INDEX IF NOT EXISTS idx_messages_guild_id ON messages(guild_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(message_created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages(channel_id, message_created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_author_created ON messages(author_id, message_created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_guild_author ON messages(guild_id, author_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      url TEXT NOT NULL,
      proxy_url TEXT,
      content_type TEXT,
      size_bytes INTEGER,
      width INTEGER,
      height INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_attachments_message_id ON attachments(message_id);

    CREATE TABLE IF NOT EXISTS user_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      guild_id TEXT NOT NULL,
      summary TEXT,
      personality_traits TEXT DEFAULT '[]',
      favorite_games TEXT DEFAULT '[]',
      favorite_topics TEXT DEFAULT '[]',
      political_leanings TEXT,
      allegiances TEXT DEFAULT '{}',
      communication_style TEXT,
      activity_level TEXT,
      sentiment_avg REAL,
      notable_quotes TEXT,
      custom_traits TEXT DEFAULT '{}',
      raw_analysis TEXT,
      message_count_analyzed INTEGER DEFAULT 0,
      last_analyzed_message_id TEXT,
      confidence_score REAL DEFAULT 0,
      version INTEGER DEFAULT 1,
      analyzed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, guild_id)
    );

    CREATE INDEX IF NOT EXISTS idx_user_profiles_user_guild ON user_profiles(user_id, guild_id);

    CREATE TABLE IF NOT EXISTS bot_queries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      asking_user_id TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      context_tokens_used INTEGER,
      response_tokens_used INTEGER,
      model_used TEXT,
      response_time_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_bot_queries_guild_created ON bot_queries(guild_id, created_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS link_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      url TEXT NOT NULL,
      domain TEXT,
      title TEXT,
      summary TEXT,
      status TEXT DEFAULT 'pending',
      error_reason TEXT,
      analyzed_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_link_analyses_message_id ON link_analyses(message_id);
    CREATE INDEX IF NOT EXISTS idx_link_analyses_guild_id ON link_analyses(guild_id);
    CREATE INDEX IF NOT EXISTS idx_link_analyses_url ON link_analyses(url);

    CREATE TABLE IF NOT EXISTS api_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      call_type TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_calls_type_created ON api_calls(call_type, created_at);

    CREATE TABLE IF NOT EXISTS feedback_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      original_bot_response TEXT NOT NULL,
      user_feedback TEXT NOT NULL,
      suggested_instruction TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_feedback_suggestions_status ON feedback_suggestions(status);
  `);

  // FTS5 virtual table for full-text search on messages
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      content,
      clean_content,
      content='messages',
      content_rowid='rowid'
    );
  `);

  // Triggers to keep FTS index in sync
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content, clean_content)
      VALUES (NEW.rowid, NEW.content, NEW.clean_content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, clean_content)
      VALUES ('delete', OLD.rowid, OLD.content, OLD.clean_content);
    END;

    CREATE TRIGGER IF NOT EXISTS messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content, clean_content)
      VALUES ('delete', OLD.rowid, OLD.content, OLD.clean_content);
      INSERT INTO messages_fts(rowid, content, clean_content)
      VALUES (NEW.rowid, NEW.content, NEW.clean_content);
    END;
  `);

  logger.info('Database migrations complete.');
}
