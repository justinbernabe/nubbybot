import type { IncomingMessage, ServerResponse } from 'node:http';
import { getDb } from '../../database/client.js';
import { sendJson } from '../middleware.js';
import { usageTracker } from '../../ai/usageTracker.js';
import { followUpTracker } from '../../ai/followUpTracker.js';

const VERSION = '0.5.0';

const COST_LEVELS: Record<string, 'HIGH' | 'LOW'> = {
  query: 'HIGH',
  summarize: 'HIGH',
  profile: 'HIGH',
  followup_response: 'HIGH',
  admin_chat: 'HIGH',
  link_analysis: 'LOW',
  followup_check: 'LOW',
};

const CALL_TYPE_LABELS: Record<string, string> = {
  query: 'Query (@mention)',
  summarize: 'Summarize',
  profile: 'Profile Build',
  followup_response: 'Follow-up Response',
  admin_chat: 'Admin Chat',
  link_analysis: 'Link Analysis',
  followup_check: 'Follow-up Check',
};

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

  const linksAnalyzed = (
    db.prepare("SELECT COUNT(*) as c FROM link_analyses WHERE status = 'analyzed'").get() as { c: number }
  ).c;
  const linksTotal = (db.prepare('SELECT COUNT(*) as c FROM link_analyses').get() as { c: number }).c;

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
    links: { analyzed: linksAnalyzed, total: linksTotal },
    queries: { total: queriesTotal, today: queriesToday, avgResponseMs: avgMs },
    uptime: Math.floor(process.uptime()),
    version: VERSION,
  });
}

export function costsApiHandler(_req: IncomingMessage, res: ServerResponse): void {
  const stats = usageTracker.getStats();

  const byType = stats.byType.map((row) => ({
    callType: row.call_type,
    label: CALL_TYPE_LABELS[row.call_type] ?? row.call_type,
    model: row.model,
    callCount: row.call_count,
    totalInput: row.total_input,
    totalOutput: row.total_output,
    costLevel: COST_LEVELS[row.call_type] ?? 'HIGH',
    estimatedCost: usageTracker.getCostEstimate(row.model, row.total_input, row.total_output),
  }));

  sendJson(res, {
    byType,
    today: {
      ...stats.today,
      estimatedCost: byType.reduce((sum, r) => sum + r.estimatedCost, 0),
    },
    allTime: {
      ...stats.allTime,
      estimatedCost: byType.reduce((sum, r) => sum + r.estimatedCost, 0),
    },
    activeFollowUpWindows: followUpTracker.getActiveWindowCount(),
  });
}
