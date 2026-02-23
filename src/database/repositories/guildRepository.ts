import { getDb } from '../client.js';

export const guildRepository = {
  upsert(guild: {
    id: string;
    name: string;
    icon_url?: string | null;
    owner_id?: string | null;
    member_count?: number;
  }): void {
    getDb().prepare(`
      INSERT INTO guilds (id, name, icon_url, owner_id, member_count)
      VALUES (@id, @name, @icon_url, @owner_id, @member_count)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        icon_url = excluded.icon_url,
        owner_id = excluded.owner_id,
        member_count = excluded.member_count,
        updated_at = datetime('now')
    `).run({
      id: guild.id,
      name: guild.name,
      icon_url: guild.icon_url ?? null,
      owner_id: guild.owner_id ?? null,
      member_count: guild.member_count ?? 0,
    });
  },

  findById(id: string) {
    return getDb().prepare('SELECT * FROM guilds WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  },

  findFirst() {
    return getDb().prepare('SELECT * FROM guilds ORDER BY rowid LIMIT 1').get() as Record<string, unknown> | undefined;
  },

  updateBackfillTimestamp(id: string): void {
    getDb().prepare(`UPDATE guilds SET last_backfill_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`).run(id);
  },
};
