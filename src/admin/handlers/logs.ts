import type { IncomingMessage, ServerResponse } from 'node:http';
import { memoryTransport } from '../../utils/logger.js';
import { sendJson, sendHtml } from '../middleware.js';
import { logsPage } from '../templates/logs.js';

export function logsPageHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendHtml(res, logsPage());
}

export function logsApiHandler(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const level = url.searchParams.get('level') || undefined;
  const since = url.searchParams.get('since') || undefined;

  const logs = memoryTransport.getEntries({ level, since });

  sendJson(res, { logs, total: logs.length });
}
