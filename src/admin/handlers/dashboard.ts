import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDb } from '../../database/client.js';
import { sendJson, sendHtml } from '../middleware.js';
import { dashboardPage } from '../templates/dashboard.js';

const VERSION = '0.1.0';

export function dashboardPageHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendHtml(res, dashboardPage());
}

export function statsApiHandler(_req: IncomingMessage, res: ServerResponse): void {
  const db = getDb();

  const messagesTotal = (db.prepare('SELECT COUNT(*) as c FROM messages').get() as { c: number }).c;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = today.toISOString();
  const messagesToday = (
    db.prepare('SELECT COUNT(*) as c FROM messages WHERE message_created_at >= ?').get(todayIso) as { c: number }
  ).c;

  const usersTotal = (db.prepare('SELECT COUNT(*) as c FROM users WHERE bot = 0').get() as { c: number }).c;
  const withProfiles = (db.prepare('SELECT COUNT(*) as c FROM user_profiles').get() as { c: number }).c;

  const channelsTotal = (db.prepare('SELECT COUNT(*) as c FROM channels').get() as { c: number }).c;
  const backfillComplete = (
    db.prepare('SELECT COUNT(*) as c FROM channels WHERE backfill_complete = 1').get() as { c: number }
  ).c;

  const guildsTotal = (db.prepare('SELECT COUNT(*) as c FROM guilds').get() as { c: number }).c;

  const queriesTotal = (db.prepare('SELECT COUNT(*) as c FROM bot_queries').get() as { c: number }).c;
  const queriesToday = (
    db.prepare('SELECT COUNT(*) as c FROM bot_queries WHERE created_at >= ?').get(todayIso) as { c: number }
  ).c;
  const avgMs = (
    db.prepare('SELECT AVG(response_time_ms) as a FROM bot_queries WHERE response_time_ms IS NOT NULL').get() as {
      a: number | null;
    }
  ).a;

  sendJson(res, {
    messages: { total: messagesTotal, today: messagesToday },
    users: { total: usersTotal, withProfiles },
    channels: { total: channelsTotal, backfillComplete },
    guilds: { total: guildsTotal },
    queries: { total: queriesTotal, today: queriesToday, avgResponseMs: avgMs },
    uptime: Math.floor(process.uptime()),
    version: VERSION,
  });
}
