import type { IncomingMessage, ServerResponse } from 'node:http';
import { anthropic } from '../../ai/claude.js';
import { contextBuilder } from '../../ai/contextBuilder.js';
import { getPrompt } from '../../ai/promptManager.js';
import { buildQueryUserPrompt } from '../../ai/promptTemplates.js';
import { usageTracker } from '../../ai/usageTracker.js';
import { getDb } from '../../database/client.js';
import { sendJson, sendHtml, parseJsonBody } from '../middleware.js';
import { chatPage } from '../templates/chat.js';
import { linkAnalysisService } from '../../services/linkAnalysisService.js';
import { logger } from '../../utils/logger.js';

export function chatPageHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendHtml(res, chatPage());
}

export function guildsApiHandler(_req: IncomingMessage, res: ServerResponse): void {
  const guilds = getDb()
    .prepare('SELECT id, name FROM guilds ORDER BY name')
    .all() as Array<{ id: string; name: string }>;
  sendJson(res, { guilds });
}

function buildDatabaseSnapshot(guildId: string): string {
  const db = getDb();

  const messagesTotal = (db.prepare('SELECT COUNT(*) as c FROM messages WHERE guild_id = ?').get(guildId) as { c: number }).c;
  const usersTotal = (db.prepare('SELECT COUNT(*) as c FROM users WHERE bot = 0').get() as { c: number }).c;
  const profilesTotal = (db.prepare('SELECT COUNT(*) as c FROM user_profiles WHERE guild_id = ?').get(guildId) as { c: number }).c;
  const channelsTotal = (db.prepare('SELECT COUNT(*) as c FROM channels WHERE guild_id = ?').get(guildId) as { c: number }).c;
  const backfillComplete = (db.prepare('SELECT COUNT(*) as c FROM channels WHERE guild_id = ? AND backfill_complete = 1').get(guildId) as { c: number }).c;
  const linksTotal = (db.prepare('SELECT COUNT(*) as c FROM link_analyses WHERE guild_id = ?').get(guildId) as { c: number }).c;
  const linksAnalyzed = (db.prepare("SELECT COUNT(*) as c FROM link_analyses WHERE guild_id = ? AND status = 'analyzed'").get(guildId) as { c: number }).c;
  const queriesTotal = (db.prepare('SELECT COUNT(*) as c FROM bot_queries WHERE guild_id = ?').get(guildId) as { c: number }).c;

  // Top users by message count
  const topUsers = db.prepare(`
    SELECT u.username, u.global_display_name, COUNT(*) as msg_count
    FROM messages m JOIN users u ON u.id = m.author_id
    WHERE m.guild_id = ? AND u.bot = 0 AND m.content != ''
    GROUP BY m.author_id ORDER BY msg_count DESC LIMIT 15
  `).all(guildId) as Array<{ username: string; global_display_name: string | null; msg_count: number }>;

  // Channels with message counts
  const channels = db.prepare(`
    SELECT c.name, COUNT(m.id) as msg_count, c.backfill_complete
    FROM channels c LEFT JOIN messages m ON m.channel_id = c.id
    WHERE c.guild_id = ?
    GROUP BY c.id ORDER BY msg_count DESC LIMIT 20
  `).all(guildId) as Array<{ name: string; msg_count: number; backfill_complete: number }>;

  // Recent link analyses
  const recentLinks = db.prepare(`
    SELECT url, title, summary, status FROM link_analyses
    WHERE guild_id = ? AND status = 'analyzed'
    ORDER BY created_at DESC LIMIT 10
  `).all(guildId) as Array<{ url: string; title: string | null; summary: string | null; status: string }>;

  // User profiles
  const profiles = db.prepare(`
    SELECT u.username, u.global_display_name, p.summary, p.personality_traits
    FROM user_profiles p JOIN users u ON u.id = p.user_id
    WHERE p.guild_id = ?
  `).all(guildId) as Array<{ username: string; global_display_name: string | null; summary: string; personality_traits: string }>;

  let snapshot = `**DATABASE SNAPSHOT (you have direct access to this data):**\n\n`;
  snapshot += `Total messages: ${messagesTotal.toLocaleString()}\n`;
  snapshot += `Total users: ${usersTotal} | Profiles generated: ${profilesTotal}\n`;
  snapshot += `Channels: ${channelsTotal} (${backfillComplete} backfilled)\n`;
  snapshot += `Links analyzed: ${linksAnalyzed}/${linksTotal}\n`;
  snapshot += `Bot queries served: ${queriesTotal}\n\n`;

  snapshot += `**Top Users by Message Count:**\n`;
  for (const u of topUsers) {
    snapshot += `- ${u.global_display_name ?? u.username}: ${u.msg_count.toLocaleString()} messages\n`;
  }

  snapshot += `\n**Channels:**\n`;
  for (const ch of channels) {
    snapshot += `- #${ch.name}: ${ch.msg_count.toLocaleString()} messages${ch.backfill_complete ? ' (backfilled)' : ''}\n`;
  }

  if (profiles.length > 0) {
    snapshot += `\n**User Profiles:**\n`;
    for (const p of profiles) {
      const traits = typeof p.personality_traits === 'string' ? JSON.parse(p.personality_traits) : p.personality_traits;
      snapshot += `- ${p.global_display_name ?? p.username}: ${p.summary}`;
      if (Array.isArray(traits) && traits.length > 0) {
        snapshot += ` | Traits: ${traits.join(', ')}`;
      }
      snapshot += '\n';
    }
  }

  if (recentLinks.length > 0) {
    snapshot += `\n**Recent Link Analyses:**\n`;
    for (const l of recentLinks) {
      snapshot += `- ${l.url}${l.title ? ' (' + l.title + ')' : ''}: ${l.summary ?? 'No summary'}\n`;
    }
  }

  return snapshot;
}

export async function chatApiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await parseJsonBody(req)) as { question?: string; guildId?: string };

    if (!body.question || typeof body.question !== 'string') {
      sendJson(res, { error: 'Missing "question"' }, 400);
      return;
    }
    if (!body.guildId || typeof body.guildId !== 'string') {
      sendJson(res, { error: 'Missing "guildId"' }, 400);
      return;
    }

    logger.info(`Admin chat query: "${body.question}" (guild: ${body.guildId})`);

    // Build context: FTS search + profiles + links (no channelId for admin)
    const context = contextBuilder.buildContext(body.guildId, body.question, []);
    const queryPrompt = buildQueryUserPrompt(body.question, context);

    // Build database snapshot so Claude can answer data questions
    const dbSnapshot = buildDatabaseSnapshot(body.guildId);

    const fullPrompt = `${dbSnapshot}\n\n${queryPrompt}`;

    const model = 'claude-sonnet-4-5-20250929';
    const response = await anthropic.messages.create({
      model,
      max_tokens: 1500,
      system: getPrompt('QUERY_SYSTEM_PROMPT'),
      messages: [{ role: 'user', content: fullPrompt }],
    });

    usageTracker.track('admin_chat', model, {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    });

    const answer = response.content[0].type === 'text'
      ? response.content[0].text
      : 'I could not generate a response.';

    sendJson(res, { answer });
  } catch (err) {
    logger.error('Admin chat error', { error: err });
    sendJson(res, { error: 'Failed to process question' }, 500);
  }
}

export async function linkScrapeApiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await parseJsonBody(req)) as { guildId?: string };

    if (!body.guildId || typeof body.guildId !== 'string') {
      sendJson(res, { error: 'Missing "guildId"' }, 400);
      return;
    }

    if (linkAnalysisService.isScraping()) {
      sendJson(res, { error: 'Link scrape already in progress' }, 409);
      return;
    }

    // Run in background
    linkAnalysisService.scrapeExistingLinks(body.guildId).then(stats => {
      logger.info('Link scrape finished', stats);
    }).catch(err => {
      logger.error('Link scrape failed', { error: err });
    });

    sendJson(res, { ok: true, message: 'Link scrape started. Check logs for progress.' });
  } catch (err) {
    logger.error('Link scrape trigger error', { error: err });
    sendJson(res, { error: 'Failed to start link scrape' }, 500);
  }
}

export function linkScrapeStatusHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, { running: linkAnalysisService.isScraping() });
}
