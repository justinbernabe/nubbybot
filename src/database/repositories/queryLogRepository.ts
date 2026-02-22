import { getDb } from '../client.js';

export const queryLogRepository = {
  insert(query: {
    guild_id: string;
    channel_id: string;
    asking_user_id: string;
    question: string;
    answer: string | null;
    context_tokens_used?: number | null;
    response_tokens_used?: number | null;
    model_used?: string | null;
    response_time_ms?: number | null;
  }): void {
    getDb().prepare(`
      INSERT INTO bot_queries (
        guild_id, channel_id, asking_user_id, question, answer,
        context_tokens_used, response_tokens_used, model_used, response_time_ms
      ) VALUES (
        @guild_id, @channel_id, @asking_user_id, @question, @answer,
        @context_tokens_used, @response_tokens_used, @model_used, @response_time_ms
      )
    `).run({
      guild_id: query.guild_id,
      channel_id: query.channel_id,
      asking_user_id: query.asking_user_id,
      question: query.question,
      answer: query.answer,
      context_tokens_used: query.context_tokens_used ?? null,
      response_tokens_used: query.response_tokens_used ?? null,
      model_used: query.model_used ?? null,
      response_time_ms: query.response_time_ms ?? null,
    });
  },
};
