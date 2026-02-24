import { getDb } from '../client.js';

export const channelRepository = {
  upsert(channel: {
    id: string;
    guild_id: string;
    name: string;
    type: number;
    topic?: string | null;
    parent_id?: string | null;
    position?: number;
    is_nsfw?: boolean;
  }): void {
    getDb().prepare(`
      INSERT INTO channels (id, guild_id, name, type, topic, parent_id, position, is_nsfw)
      VALUES (@id, @guild_id, @name, @type, @topic, @parent_id, @position, @is_nsfw)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        type = excluded.type,
        topic = excluded.topic,
        parent_id = excluded.parent_id,
        position = excluded.position,
        is_nsfw = excluded.is_nsfw,
        updated_at = datetime('now')
    `).run({
      id: channel.id,
      guild_id: channel.guild_id,
      name: channel.name,
      type: channel.type,
      topic: channel.topic ?? null,
      parent_id: channel.parent_id ?? null,
      position: channel.position ?? 0,
      is_nsfw: channel.is_nsfw ? 1 : 0,
    });
  },

  findById(id: string) {
    return getDb().prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  },

  findByGuild(guildId: string) {
    return getDb().prepare('SELECT * FROM channels WHERE guild_id = ?').all(guildId) as Array<Record<string, unknown>>;
  },

  update(id: string, data: { last_backfill_message_id?: string | null; backfill_complete?: boolean }): void {
    const sets: string[] = ["updated_at = datetime('now')"];
    const params: Record<string, unknown> = { id };

    if (data.last_backfill_message_id !== undefined) {
      sets.push('last_backfill_message_id = @last_backfill_message_id');
      params.last_backfill_message_id = data.last_backfill_message_id;
    }
    if (data.backfill_complete !== undefined) {
      sets.push('backfill_complete = @backfill_complete');
      params.backfill_complete = data.backfill_complete ? 1 : 0;
    }

    getDb().prepare(`UPDATE channels SET ${sets.join(', ')} WHERE id = @id`).run(params);
  },
};
