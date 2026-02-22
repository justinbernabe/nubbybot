import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAllPromptInfo, setPromptOverride, clearPromptOverride } from '../../ai/promptManager.js';
import { sendJson, sendHtml, parseJsonBody } from '../middleware.js';
import { promptsPage } from '../templates/prompts.js';

const VALID_KEYS = new Set([
  'QUERY_SYSTEM_PROMPT',
  'SUMMARIZE_SYSTEM_PROMPT',
  'PROFILE_ANALYSIS_SYSTEM_PROMPT',
]);

export function promptsPageHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendHtml(res, promptsPage());
}

export function promptsListApiHandler(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, { prompts: getAllPromptInfo() });
}

export async function promptUpdateApiHandler(
  req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const key = params.key;
  if (!VALID_KEYS.has(key)) {
    sendJson(res, { error: 'Invalid prompt key' }, 400);
    return;
  }

  try {
    const body = (await parseJsonBody(req)) as { value?: string };
    if (!body.value || typeof body.value !== 'string') {
      sendJson(res, { error: 'Missing "value" in body' }, 400);
      return;
    }
    setPromptOverride(key as 'QUERY_SYSTEM_PROMPT' | 'SUMMARIZE_SYSTEM_PROMPT' | 'PROFILE_ANALYSIS_SYSTEM_PROMPT', body.value);
    sendJson(res, { ok: true });
  } catch {
    sendJson(res, { error: 'Invalid request body' }, 400);
  }
}

export async function promptDeleteApiHandler(
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
): Promise<void> {
  const key = params.key;
  if (!VALID_KEYS.has(key)) {
    sendJson(res, { error: 'Invalid prompt key' }, 400);
    return;
  }
  clearPromptOverride(key as 'QUERY_SYSTEM_PROMPT' | 'SUMMARIZE_SYSTEM_PROMPT' | 'PROFILE_ANALYSIS_SYSTEM_PROMPT');
  sendJson(res, { ok: true });
}
