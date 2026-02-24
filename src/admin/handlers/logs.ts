import type { IncomingMessage, ServerResponse } from 'node:http';
import { memoryTransport } from '../../utils/logger.js';
import { sendJson } from '../middleware.js';

export function logsApiHandler(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const level = url.searchParams.get('level') || undefined;
  const since = url.searchParams.get('since') || undefined;

  const logs = memoryTransport.getEntries({ level, since });

  sendJson(res, { logs, total: logs.length });
}
