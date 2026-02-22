import type { IncomingMessage, ServerResponse } from 'node:http';
import { queryHandler } from '../../ai/queryHandler.js';
import { getDb } from '../../database/client.js';
import { sendJson, sendHtml, parseJsonBody } from '../middleware.js';
import { chatPage } from '../templates/chat.js';
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

    const answer = await queryHandler.answerQuestion(body.question, body.guildId, '', []);
    sendJson(res, { answer });
  } catch (err) {
    logger.error('Admin chat error', { error: err });
    sendJson(res, { error: 'Failed to process question' }, 500);
  }
}
