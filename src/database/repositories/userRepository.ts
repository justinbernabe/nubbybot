import { getDb } from '../client.js';

export const userRepository = {
  upsert(user: {
    id: string;
    username: string;
    discriminator?: string;
    global_display_name?: string | null;
    avatar_url?: string | null;
    bot?: boolean;
  }): void {
    getDb().prepare(`
      INSERT INTO users (id, username, discriminator, global_display_name, avatar_url, bot)
      VALUES (@id, @username, @discriminator, @global_display_name, @avatar_url, @bot)
      ON CONFLICT(id) DO UPDATE SET
        username = excluded.username,
        discriminator = excluded.discriminator,
        global_display_name = excluded.global_display_name,
        avatar_url = excluded.avatar_url,
        last_seen_at = datetime('now'),
        updated_at = datetime('now')
    `).run({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator ?? '0',
      global_display_name: user.global_display_name ?? null,
      avatar_url: user.avatar_url ?? null,
      bot: user.bot ? 1 : 0,
    });
  },

  findById(id: string) {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  },

  findByName(name: string) {
    const lower = `%${name.toLowerCase()}%`;
    return getDb().prepare(`
      SELECT * FROM users
      WHERE LOWER(username) LIKE ? OR LOWER(global_display_name) LIKE ?
    `).all(lower, lower) as Array<Record<string, unknown>>;
  },

  findAllNonBot() {
    return getDb().prepare('SELECT * FROM users WHERE bot = 0').all() as Array<Record<string, unknown>>;
  },

  addNickname(userId: string, guildId: string, nickname: string | null, displayName: string | null): void {
    getDb().prepare(`
      INSERT INTO user_nicknames (user_id, guild_id, nickname, display_name)
      VALUES (@user_id, @guild_id, @nickname, @display_name)
    `).run({
      user_id: userId,
      guild_id: guildId,
      nickname: nickname,
      display_name: displayName,
    });
  },

  getNicknames(userId: string, guildId: string) {
    return getDb().prepare(`
      SELECT * FROM user_nicknames
      WHERE user_id = ? AND guild_id = ?
      ORDER BY changed_at DESC
    `).all(userId, guildId) as Array<Record<string, unknown>>;
  },

  /** Load all non-bot users with their nicknames for a guild in 2 queries (not N+1). */
  findAllWithNicknames(guildId: string): Array<{
    id: string;
    username: string;
    global_display_name: string | null;
    nicknames: string[];
  }> {
    const users = getDb().prepare(
      'SELECT id, username, global_display_name FROM users WHERE bot = 0',
    ).all() as Array<{ id: string; username: string; global_display_name: string | null }>;

    const allNicknames = getDb().prepare(
      'SELECT user_id, nickname, display_name FROM user_nicknames WHERE guild_id = ?',
    ).all(guildId) as Array<{ user_id: string; nickname: string | null; display_name: string | null }>;

    const nicknameMap = new Map<string, string[]>();
    for (const n of allNicknames) {
      if (!nicknameMap.has(n.user_id)) nicknameMap.set(n.user_id, []);
      if (n.nickname) nicknameMap.get(n.user_id)!.push(n.nickname);
      if (n.display_name) nicknameMap.get(n.user_id)!.push(n.display_name);
    }

    return users.map(u => ({
      ...u,
      nicknames: nicknameMap.get(u.id) ?? [],
    }));
  },
};
