# NubbyGPT Discord Bot

## Project Overview
NubbyGPT is a Discord bot that archives all server messages into a local SQLite database, builds AI-generated user profiles, and answers questions about server history using Claude AI. It runs as a Docker container on a homelab (Synology/Portainer).

## Tech Stack
- **Runtime**: Node.js 22 + TypeScript (ES modules, `"type": "module"`)
- **Discord**: discord.js v14 with privileged intents (MESSAGE_CONTENT, SERVER_MEMBERS)
- **Database**: SQLite via better-sqlite3 (stored at `/config/nubbybot.db`)
- **AI**: Anthropic Claude API (`@anthropic-ai/sdk`), using `claude-sonnet-4-5-20250929`
- **Deployment**: Docker (multi-stage Alpine build) + docker-compose

## Key Architecture Decisions
- **SQLite over Supabase**: No external dependencies, all data on homelab, survives container rebuilds via bind mount to `./config`
- **FTS5 for search**: SQLite FTS5 virtual table with triggers to keep index in sync automatically
- **Discord IDs as TEXT**: JavaScript can't safely handle 64-bit snowflake IDs as numbers
- **Upsert everywhere**: Messages may be processed twice (backfill + live archiving), all writes are idempotent
- **Synchronous DB calls**: better-sqlite3 is synchronous, which is fine for SQLite and simplifies the code
- **Resumable backfill**: Stores `last_backfill_message_id` per channel so crashes don't lose progress

## Project Structure
```
src/
  index.ts              - Entry point, boots client + registers events
  config.ts             - Environment config with validation
  bot/client.ts         - Discord.js client with intents
  bot/events/           - Event handlers (ready, messageCreate, messageUpdate, guildMemberUpdate, userUpdate, interactionCreate)
  database/client.ts    - SQLite singleton (better-sqlite3 with WAL mode)
  database/migrations.ts - Schema creation + FTS5 triggers
  database/repositories/ - Data access (guild, channel, user, message, profile, queryLog)
  services/             - Business logic (archive, backfill, profile)
  ai/                   - Claude integration (client, prompts, context builder, query handler)
  commands/register.ts  - Slash command registration script
```

## Commands
- `npm run dev` - Development with hot reload (tsx watch)
- `npm run build` - Compile TypeScript
- `npm run start` - Run compiled JS
- `npm run register-commands` - Register slash commands with Discord API

## Important Notes
- Discord App ID: 1363093908526993509
- The bot requires MESSAGE_CONTENT and SERVER_MEMBERS privileged intents enabled in the Discord Developer Portal
- `.env` contains secrets (DISCORD_TOKEN, ANTHROPIC_API_KEY) - never commit this file
- `.env.example` has placeholder values for reference
- The `/config` directory is bind-mounted for persistent SQLite storage
- Backfill uses 1-second delays between batches to respect Discord rate limits
- Profile building uses 2-second delays between users to respect Claude API rate limits
