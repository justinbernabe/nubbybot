# NubbyGPT

Discord bot that brings Claude AI into a server. Archives messages, builds user profiles, analyzes shared links, and answers any question — both about server history and general knowledge (facts, trivia, debates, etc.). Every server member can @mention the bot to use Claude's full capabilities within the context of their conversations. Deadpan Murderbot-inspired persona.

## Tech Stack

- **Runtime**: Node.js 22 (ES modules, `"type": "module"`)
- **Language**: TypeScript 5.7 (`npm run build` compiles to `dist/`)
- **Discord**: discord.js v14 with privileged intents (MESSAGE_CONTENT, SERVER_MEMBERS)
- **Database**: SQLite via better-sqlite3 (WAL mode, FTS5 full-text search)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`) — Sonnet for queries/profiles, Haiku for link analysis
- **Logging**: Winston (console + in-memory transport for admin panel)
- **Deployment**: Docker multi-stage Alpine build, Portainer on Synology NAS

## Project Structure

```
src/
  index.ts                          — Entry point, starts Discord client + admin server
  config.ts                         — Env-based config with validation
  ai/
    claude.ts                       — Anthropic SDK singleton
    promptTemplates.ts              — Hardcoded default prompts (query, summarize, profile, link)
    promptManager.ts                — Runtime prompt overrides (checks settings DB, falls back to defaults)
    queryHandler.ts                 — Handles @mentions and /ask, routes to answer or summarize
    contextBuilder.ts               — Builds context for queries (recent channel convo, FTS search, profiles, link analyses)
  bot/
    client.ts                       — Discord.js client factory with intents
    events/
      ready.ts                      — Guild/channel sync, auto catch-up on startup
      messageCreate.ts              — Archives messages, triggers link analysis, handles mentions
      messageUpdate.ts              — Updates archived messages on edit
      interactionCreate.ts          — Slash commands: /backfill, /profile, /ask
      userUpdate.ts                 — Track user changes
      guildMemberUpdate.ts          — Track nickname changes
  database/
    client.ts                       — SQLite singleton (creates directory if needed)
    migrations.ts                   — All CREATE TABLE statements (idempotent, runs on every startup)
    repositories/
      messageRepository.ts          — Messages CRUD, FTS search, attachment storage
      userRepository.ts             — Users + nicknames
      channelRepository.ts          — Channels
      guildRepository.ts            — Guilds
      profileRepository.ts          — AI-generated user profiles
      queryLogRepository.ts         — Bot query history
      linkRepository.ts             — Link analyses CRUD + keyword search
  services/
    archiveService.ts               — Archives Discord messages to DB (upserts channel, user, message, attachments)
    backfillService.ts              — Historical message backfill with progress %, catch-up on startup, retry logic
    profileService.ts               — AI user profile generation via Claude Sonnet
    linkAnalysisService.ts          — URL extraction, page fetch, Claude Haiku summarization
  admin/
    server.ts                       — HTTP server on port 7774 (native node:http, zero deps)
    router.ts                       — Simple URL pattern matcher with :param support
    middleware.ts                   — Auth (bearer token/cookie), JSON body parser, response helpers
    memoryTransport.ts              — Winston transport for live log viewing (circular buffer, 500 entries)
    settingsRepository.ts           — Settings table CRUD (used for prompt overrides)
    handlers/                       — API + page handlers (dashboard, logs, prompts, settings, chat, login)
    templates/                      — Inline HTML templates (dark theme, no frontend build step)
  utils/
    logger.ts                       — Winston logger + memory transport
    rateLimiter.ts                  — delay() and retryWithBackoff()
  commands/
    register.ts                     — Discord slash command registration script
```

## Database Tables

- `guilds` — Discord servers
- `channels` — Discord channels (tracks backfill progress per channel)
- `users` — Discord users
- `user_nicknames` — Nickname history per guild
- `messages` — Archived messages (+ `messages_fts` FTS5 virtual table with auto-sync triggers)
- `attachments` — File attachments from messages
- `user_profiles` — AI-generated personality profiles (JSON fields for traits, games, topics, etc.)
- `bot_queries` — Query history with response times
- `settings` — Key-value store for runtime config (prompt overrides)
- `link_analyses` — URL summaries from Claude Haiku (status: pending/analyzed/error)

## Key Features

1. **Message Archiving** — Every message archived to SQLite with FTS5 full-text search index
2. **Smart Backfill** — `/backfill` fetches all historical messages with progress %, skips already-complete channels, auto catch-up on startup for missed messages
3. **AI Queries** — @mention or `/ask` to ask anything — server history, general knowledge, fact-checking, trivia. Bot reads recent channel conversation for context awareness. Powered by Claude Sonnet (2 sentence max, Murderbot persona)
4. **Summarize** — @mention with "summarize today/this week/last 3 hours" for conversation recaps
5. **User Profiles** — `/profile @user` generates AI personality analysis from message history
6. **Link Analysis** — Silently fetches and summarizes URLs posted in chat via Claude Haiku, stored for future context. Retroactive scrape available from dashboard (last year of messages).
7. **Admin Panel** (port 7774) — Mobile-responsive. Dashboard stats, live logs, runtime prompt editor, settings viewer, chat testing interface with database access.
8. **Runtime Prompt Editing** — Edit all system prompts from admin panel, changes persist in SQLite across restarts, apply immediately without redeploying

## Architecture Decisions

- **SQLite over cloud DB**: No external dependencies, all data on homelab, survives container rebuilds via bind mount
- **FTS5 for search**: SQLite FTS5 virtual table with triggers to keep index in sync automatically
- **Discord IDs as TEXT**: JavaScript can't safely handle 64-bit snowflake IDs as numbers
- **Upsert everywhere**: Messages may be processed twice (backfill + live), all writes are idempotent
- **Synchronous DB calls**: better-sqlite3 is synchronous, which is fine for SQLite and simplifies the code
- **Resumable backfill**: Stores `last_backfill_message_id` per channel so crashes don't lose progress
- **No frontend build step**: Admin panel uses inline HTML template literals, compiles with tsc alongside everything else
- **Prompt indirection**: promptManager.ts wraps hardcoded defaults with DB override layer — consumers call `getPrompt('NAME')` instead of importing constants directly

## Build & Run

```bash
npm run build              # TypeScript compile
npm run dev                # Dev mode with tsx watch
npm start                  # Run compiled JS
npm run register-commands  # Register Discord slash commands with API
```

## Docker Deployment

Runs on Synology NAS via Portainer (Repository stack mode, branch: `refs/heads/main`).

- Volume: `/volume2/docker-ssd/nubbybot/config:/config:rw`
- User override: `1028:65537` (matches Synology host UID/GID)
- Port: `7774:7774` (admin panel)

**Important**: Portainer's "Pull and redeploy" does NOT rebuild Docker images from source. You must delete the old image in Portainer's Images section first, then recreate/redeploy the stack.

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `DISCORD_TOKEN` | Yes | — |
| `ANTHROPIC_API_KEY` | Yes | — |
| `DISCORD_APP_ID` | No | `1363093908526993509` |
| `DB_PATH` | No | `/config/nubbybot.db` |
| `LOG_LEVEL` | No | `info` |
| `BACKFILL_BATCH_DELAY_MS` | No | `1000` |
| `PROFILE_UPDATE_INTERVAL_HOURS` | No | `24` |
| `ADMIN_PORT` | No | `7774` |
| `ADMIN_TOKEN` | No | (empty = no auth) |

## Bot Persona

Murderbot-inspired: deadpan, dry, efficient. Answers because it has to, not because it wants to. 2 sentences max. No pleasantries, no filler, no enthusiasm. References server inside jokes when relevant. Prompts are editable at runtime via admin panel `/prompts`.

The bot is not just a server log reader — it's Claude with full general knowledge. If someone asks "who's the CEO of Tesla" or "is this true?", it answers factually. It reads recent channel messages to understand conversational context (e.g., mid-argument fact checks). When greeted, it responds casually ("What do you need?" / "I'm here. What's up.") instead of a canned help message.

## Conventions

- Repository pattern for all DB access (synchronous better-sqlite3)
- Service layer for business logic, separate from bot event handlers
- ES module imports with `.js` extensions (required for Node ESM)
- `as const` config object from environment variables
- Graceful shutdown (SIGINT/SIGTERM) closes admin server, Discord client, and DB
- All Discord API errors caught gracefully (`.catch(() => {})` for expired interaction tokens)
- Rate limiting: 1s between Discord API batches, 2s between Claude profile calls, 1s between link analyses
