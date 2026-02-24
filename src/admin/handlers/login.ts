import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../../config.js';
import { sendJson, parseJsonBody } from '../middleware.js';

export async function loginApiHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!config.admin.token) {
    sendJson(res, { ok: true });
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as { token?: string };
    if (body.token === config.admin.token) {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `nubby_admin=${config.admin.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`,
      });
      res.end(JSON.stringify({ ok: true }));
    } else {
      sendJson(res, { error: 'Invalid token' }, 401);
    }
  } catch {
    sendJson(res, { error: 'Invalid request' }, 400);
  }
}
