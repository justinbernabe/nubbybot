import { getDb } from '../database/client.js';
import { logger } from '../utils/logger.js';

export type CallType =
  | 'query'
  | 'summarize'
  | 'profile'
  | 'link_analysis'
  | 'followup_check'
  | 'followup_response'
  | 'admin_chat';

interface UsageData {
  input_tokens: number;
  output_tokens: number;
}

// Approximate pricing per million tokens
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5-20250929': { input: 3.0, output: 15.0 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.0 },
};

export const usageTracker = {
  track(callType: CallType, model: string, usage: UsageData): void {
    try {
      getDb()
        .prepare(
          `INSERT INTO api_calls (call_type, model, input_tokens, output_tokens)
           VALUES (?, ?, ?, ?)`,
        )
        .run(callType, model, usage.input_tokens, usage.output_tokens);
    } catch (err) {
      logger.error('Failed to track API usage', { callType, error: err });
    }
  },

  getCostEstimate(model: string, inputTokens: number, outputTokens: number): number {
    const pricing = PRICING[model] ?? PRICING['claude-sonnet-4-5-20250929'];
    return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  },

  getStats(): {
    byType: Array<{
      call_type: string;
      model: string;
      call_count: number;
      total_input: number;
      total_output: number;
    }>;
    today: { call_count: number; total_input: number; total_output: number };
    allTime: { call_count: number; total_input: number; total_output: number };
  } {
    const db = getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const byType = db
      .prepare(
        `SELECT call_type, model, COUNT(*) as call_count,
                COALESCE(SUM(input_tokens), 0) as total_input,
                COALESCE(SUM(output_tokens), 0) as total_output
         FROM api_calls GROUP BY call_type, model ORDER BY total_input DESC`,
      )
      .all() as Array<{
      call_type: string;
      model: string;
      call_count: number;
      total_input: number;
      total_output: number;
    }>;

    const todayStats = db
      .prepare(
        `SELECT COUNT(*) as call_count,
                COALESCE(SUM(input_tokens), 0) as total_input,
                COALESCE(SUM(output_tokens), 0) as total_output
         FROM api_calls WHERE created_at >= ?`,
      )
      .get(todayIso) as { call_count: number; total_input: number; total_output: number };

    const allTime = db
      .prepare(
        `SELECT COUNT(*) as call_count,
                COALESCE(SUM(input_tokens), 0) as total_input,
                COALESCE(SUM(output_tokens), 0) as total_output
         FROM api_calls`,
      )
      .get() as { call_count: number; total_input: number; total_output: number };

    return { byType, today: todayStats, allTime };
  },
};
