import Anthropic from '@anthropic-ai/sdk';
import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { delay } from '../utils/rateLimiter.js';

export const anthropic = new Anthropic({ apiKey: config.anthropic.apiKey });

/**
 * Create a message with automatic retry on 429 rate limit errors.
 * User-facing calls use shorter backoff (10s base) vs background tasks.
 */
export async function createMessageWithRetry(
  params: MessageCreateParamsNonStreaming,
  label: string,
  maxRetries = 3,
  baseDelayMs = 10_000,
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await anthropic.messages.create(params);
    } catch (err) {
      const isRateLimit = err instanceof Error &&
        (err.message.includes('429') || err.message.includes('rate_limit'));
      if (isRateLimit && attempt < maxRetries) {
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        logger.warn(`[${label}] Rate limited (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${Math.round(waitMs / 1000)}s`);
        await delay(waitMs);
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}
