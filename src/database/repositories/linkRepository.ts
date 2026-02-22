import { getDb } from '../client.js';

export interface LinkAnalysisRow {
  id: number;
  message_id: string;
  guild_id: string;
  channel_id: string;
  author_id: string;
  url: string;
  domain: string | null;
  title: string | null;
  summary: string | null;
  status: string;
  error_reason: string | null;
  analyzed_at: string | null;
  created_at: string;
}

export const linkRepository = {
  insert(data: {
    message_id: string;
    guild_id: string;
    channel_id: string;
    author_id: string;
    url: string;
    domain: string;
  }): number {
    const result = getDb()
      .prepare(
        `INSERT INTO link_analyses (message_id, guild_id, channel_id, author_id, url, domain)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(data.message_id, data.guild_id, data.channel_id, data.author_id, data.url, data.domain);
    return result.lastInsertRowid as number;
  },

  markAnalyzed(id: number, title: string | null, summary: string): void {
    getDb()
      .prepare(
        `UPDATE link_analyses SET title = ?, summary = ?, status = 'analyzed', analyzed_at = datetime('now') WHERE id = ?`,
      )
      .run(title, summary, id);
  },

  markError(id: number, reason: string): void {
    getDb()
      .prepare(`UPDATE link_analyses SET status = 'error', error_reason = ?, analyzed_at = datetime('now') WHERE id = ?`)
      .run(reason, id);
  },

  findByUrl(url: string): LinkAnalysisRow | undefined {
    return getDb()
      .prepare(`SELECT * FROM link_analyses WHERE url = ? AND status = 'analyzed' LIMIT 1`)
      .get(url) as LinkAnalysisRow | undefined;
  },

  searchByGuild(guildId: string, query: string, limit = 10): LinkAnalysisRow[] {
    const terms = query
      .replace(/[^\w\s]/g, '')
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 2)
      .map((t) => `%${t}%`);

    if (terms.length === 0) return [];

    const conditions = terms.map(() => `(title LIKE ? OR summary LIKE ? OR url LIKE ?)`).join(' OR ');
    const params = terms.flatMap((t) => [t, t, t]);

    return getDb()
      .prepare(
        `SELECT * FROM link_analyses
         WHERE guild_id = ? AND status = 'analyzed' AND (${conditions})
         ORDER BY created_at DESC LIMIT ?`,
      )
      .all(guildId, ...params, limit) as LinkAnalysisRow[];
  },
};
