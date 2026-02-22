import { logger } from './logger.js';

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 3,
  baseDelayMs = 2000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (attempt === maxRetries) throw err;
      const waitMs = baseDelayMs * Math.pow(2, attempt);
      logger.warn(`${label} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${waitMs}ms`, { error: err });
      await delay(waitMs);
    }
  }
  throw new Error('unreachable');
}
