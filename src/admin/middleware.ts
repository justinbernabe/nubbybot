import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config.js';

export function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const token = config.admin.token;
  if (!token) return true;

  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${token}`) return true;

  // Check cookie
  const cookies = parseCookies(req.headers.cookie ?? '');
  if (cookies['nubby_admin'] === token) return true;

  // Check query parameter
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (url.searchParams.get('token') === token) return true;

  // Redirect HTML requests to login, return 401 for API
  if (req.url?.startsWith('/api/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
  } else {
    res.writeHead(302, { Location: '/login' });
    res.end();
  }
  return false;
}

export async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_048_576) {
        reject(new Error('Body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader
      .split(';')
      .filter((c) => c.includes('='))
      .map((c) => {
        const [key, ...rest] = c.trim().split('=');
        return [key, rest.join('=')];
      }),
  );
}

export function sendJson(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

export function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}
