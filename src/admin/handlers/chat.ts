import type { IncomingMessage, ServerResponse } from 'node:http';
import { createMessageWithRetry } from '../../ai/claude.js';
import { contextBuilder } from '../../ai/contextBuilder.js';
import { getPrompt } from '../../ai/promptManager.js';
import { buildQueryUserPrompt } from '../../ai/promptTemplates.js';
import { usageTracker } from '../../ai/usageTracker.js';
import { getDb } from '../../database/client.js';
import { sendJson, sendHtml, parseJsonBody } from '../middleware.js';
import { chatPage } from '../templates/chat.js';
import { linkAnalysisService } from '../../services/linkAnalysisService.js';
import { autoProfileService } from '../../services/autoProfileService.js';
import { trainingManager } from '../../ai/trainingManager.js';
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

    // Check for training commands (admin panel always has access)
    const trainingResult = trainingManager.handleCommand(body.question, 'admin');
    if (trainingResult) {
      sendJson(res, { answer: trainingResult });
      return;
    }

    // Build context identical to Discord: FTS search + profiles + links
    const context = contextBuilder.buildContext(body.guildId, body.question, []);
    const fullPrompt = buildQueryUserPrompt(body.question, context);

    const model = 'claude-sonnet-4-5-20250929';
    const response = await createMessageWithRetry({
      model,
      max_tokens: 1500,
      system: getPrompt('QUERY_SYSTEM_PROMPT'),
      messages: [{ role: 'user', content: fullPrompt }],
    }, 'admin_chat');

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

export async function profileBuildApiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = (await parseJsonBody(req)) as { guildId?: string };

    if (!body.guildId || typeof body.guildId !== 'string') {
      sendJson(res, { error: 'Missing "guildId"' }, 400);
      return;
    }

    if (autoProfileService.isRunning()) {
      sendJson(res, { error: 'Profile build already in progress' }, 409);
      return;
    }

    autoProfileService.buildMissingAndStaleProfiles(body.guildId).then((stats) => {
      logger.info('Profile build finished', stats);
    }).catch((err) => {
      logger.error('Profile build failed', { error: err });
    });

    sendJson(res, { ok: true, message: 'Profile build started. Check logs for progress.' });
  } catch (err) {
    logger.error('Profile build trigger error', { error: err });
    sendJson(res, { error: 'Failed to start profile build' }, 500);
  }
}

export function profileBuildStatusHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, { running: autoProfileService.isRunning() });
}
