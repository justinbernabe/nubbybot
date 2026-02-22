import { getDb } from '../database/client.js';

export const settingsRepository = {
  get(key: string): string | undefined {
    const row = getDb()
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value;
  },

  set(key: string, value: string): void {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, value);
  },

  delete(key: string): boolean {
    const result = getDb().prepare('DELETE FROM settings WHERE key = ?').run(key);
    return result.changes > 0;
  },

  getAll(): Array<{ key: string; value: string; updated_at: string }> {
    return getDb()
      .prepare('SELECT * FROM settings ORDER BY key')
      .all() as Array<{ key: string; value: string; updated_at: string }>;
  },
};
