import { getDb } from '../client.js';
import type { SearchMessageResult, UserMessageResult } from '../../types/database.js';

export const messageRepository = {
  upsert(message: {
    id: string;
    guild_id: string;
    channel_id: string;
    author_id: string;
    content: string;
    clean_content?: string | null;
    type?: number;
    reference_message_id?: string | null;
    is_pinned?: boolean;
    has_attachments?: boolean;
    has_embeds?: boolean;
    embed_data?: unknown;
    sticker_ids?: string[] | null;
    edited_at?: string | null;
    message_created_at: string;
  }): void {
    getDb().prepare(`
      INSERT INTO messages (
        id, guild_id, channel_id, author_id, content, clean_content,
        type, reference_message_id, is_pinned, has_attachments, has_embeds,
        embed_data, sticker_ids, edited_at, message_created_at
      ) VALUES (
        @id, @guild_id, @channel_id, @author_id, @content, @clean_content,
        @type, @reference_message_id, @is_pinned, @has_attachments, @has_embeds,
        @embed_data, @sticker_ids, @edited_at, @message_created_at
      )
      ON CONFLICT(id) DO UPDATE SET
        content = excluded.content,
        clean_content = excluded.clean_content,
        is_pinned = excluded.is_pinned,
        edited_at = excluded.edited_at
    `).run({
      id: message.id,
      guild_id: message.guild_id,
      channel_id: message.channel_id,
      author_id: message.author_id,
      content: message.content,
      clean_content: message.clean_content ?? null,
      type: message.type ?? 0,
      reference_message_id: message.reference_message_id ?? null,
      is_pinned: message.is_pinned ? 1 : 0,
      has_attachments: message.has_attachments ? 1 : 0,
      has_embeds: message.has_embeds ? 1 : 0,
      embed_data: message.embed_data ? JSON.stringify(message.embed_data) : null,
      sticker_ids: message.sticker_ids ? JSON.stringify(message.sticker_ids) : null,
      edited_at: message.edited_at ?? null,
      message_created_at: message.message_created_at,
    });
  },

  upsertAttachment(attachment: {
    id: string;
    message_id: string;
    filename: string;
    url: string;
    proxy_url?: string | null;
    content_type?: string | null;
    size_bytes?: number | null;
    width?: number | null;
    height?: number | null;
  }): void {
    getDb().prepare(`
      INSERT INTO attachments (id, message_id, filename, url, proxy_url, content_type, size_bytes, width, height)
      VALUES (@id, @message_id, @filename, @url, @proxy_url, @content_type, @size_bytes, @width, @height)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        proxy_url = excluded.proxy_url
    `).run({
      id: attachment.id,
      message_id: attachment.message_id,
      filename: attachment.filename,
      url: attachment.url,
      proxy_url: attachment.proxy_url ?? null,
      content_type: attachment.content_type ?? null,
      size_bytes: attachment.size_bytes ?? null,
      width: attachment.width ?? null,
      height: attachment.height ?? null,
    });
  },

  searchMessages(guildId: string, query: string, limit = 50, authorId?: string): SearchMessageResult[] {
    if (authorId) {
      return getDb().prepare(`
        SELECT m.id, m.channel_id, m.author_id, m.content, m.message_created_at,
               rank AS rank
        FROM messages_fts fts
        JOIN messages m ON m.rowid = fts.rowid
        WHERE messages_fts MATCH @query
          AND m.guild_id = @guild_id
          AND m.author_id = @author_id
        ORDER BY rank
        LIMIT @limit
      `).all({ query, guild_id: guildId, author_id: authorId, limit }) as SearchMessageResult[];
    }

    return getDb().prepare(`
      SELECT m.id, m.channel_id, m.author_id, m.content, m.message_created_at,
             rank AS rank
      FROM messages_fts fts
      JOIN messages m ON m.rowid = fts.rowid
      WHERE messages_fts MATCH @query
        AND m.guild_id = @guild_id
      ORDER BY rank
      LIMIT @limit
    `).all({ query, guild_id: guildId, limit }) as SearchMessageResult[];
  },

  getRecentByUser(userId: string, guildId: string, limit = 200): UserMessageResult[] {
    return getDb().prepare(`
      SELECT id, channel_id, content, message_created_at
      FROM messages
      WHERE author_id = @user_id AND guild_id = @guild_id AND content != ''
      ORDER BY message_created_at DESC
      LIMIT @limit
    `).all({ user_id: userId, guild_id: guildId, limit }) as UserMessageResult[];
  },

  getByChannelSince(channelId: string, since: string, limit = 500) {
    return getDb().prepare(`
      SELECT m.id, m.author_id, m.content, m.message_created_at, u.username, u.global_display_name
      FROM messages m
      JOIN users u ON u.id = m.author_id
      WHERE m.channel_id = @channel_id
        AND m.message_created_at >= @since
        AND m.content != ''
      ORDER BY m.message_created_at ASC
      LIMIT @limit
    `).all({ channel_id: channelId, since, limit }) as Array<Record<string, unknown>>;
  },

  getByGuildSince(guildId: string, since: string, limit = 500) {
    return getDb().prepare(`
      SELECT m.id, m.channel_id, m.author_id, m.content, m.message_created_at,
             u.username, u.global_display_name, c.name as channel_name
      FROM messages m
      JOIN users u ON u.id = m.author_id
      JOIN channels c ON c.id = m.channel_id
      WHERE m.guild_id = @guild_id
        AND m.message_created_at >= @since
        AND m.content != ''
      ORDER BY m.message_created_at ASC
      LIMIT @limit
    `).all({ guild_id: guildId, since, limit }) as Array<Record<string, unknown>>;
  },

  countByUser(userId: string, guildId: string): number {
    const row = getDb().prepare(`
      SELECT COUNT(*) as count FROM messages WHERE author_id = ? AND guild_id = ?
    `).get(userId, guildId) as { count: number };
    return row.count;
  },

  getDistinctAuthorIds(guildId: string): string[] {
    const rows = getDb().prepare(`
      SELECT DISTINCT author_id FROM messages
      WHERE guild_id = ? AND content != ''
    `).all(guildId) as Array<{ author_id: string }>;
    return rows.map(r => r.author_id);
  },

  exists(id: string): boolean {
    const row = getDb().prepare('SELECT 1 FROM messages WHERE id = ?').get(id);
    return !!row;
  },
};
