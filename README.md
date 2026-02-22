# NubbyGPT

A Discord bot that archives all server messages, builds AI-powered user profiles, and answers questions about your server's history using Claude AI.

## Features

- **Message Archiving** - Automatically archives every message sent in the server
- **History Backfill** - Fetches and archives all historical messages from accessible channels
- **User Profiling** - AI-generated personality profiles including favorite games, topics, communication style, political leanings, and notable quotes
- **Name Tracking** - Records nickname and username changes over time
- **Question Answering** - @mention the bot to ask questions about server history and members
- **Conversation Summaries** - `@NubbyGPT summarize today` gives a 3-sentence TLDR of the day's conversations
- **Full-Text Search** - SQLite FTS5 index for fast message searching

## Discord Bot Setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. **Bot** tab: Enable these Privileged Gateway Intents:
   - `MESSAGE CONTENT`
   - `SERVER MEMBERS`
3. **OAuth2** tab: Generate an invite URL with scopes `bot` + `applications.commands` and permissions:
   - Read Messages/View Channels
   - Send Messages
   - Read Message History
   - Use Slash Commands
   - Embed Links
   - Add Reactions

## Deploy on Synology / Homelab (Portainer)

1. In Portainer: **Stacks** > **Add Stack** > **Web editor**
2. Paste the contents of `docker-compose.yml`
3. Add environment variables in the Portainer UI:
   - `DISCORD_TOKEN` = your bot token
   - `ANTHROPIC_API_KEY` = your Anthropic API key
4. Deploy

**Data persistence**: The SQLite database is stored at `/config/db/nubbybot.db`. The `/config` volume is mounted to your Synology at `/volume2/docker-ssd/nubbybot/config`.

## Usage

### @mention (primary interaction)
- `@NubbyGPT what does John think about pineapple on pizza?`
- `@NubbyGPT who plays Valorant the most?`
- `@NubbyGPT summarize today`
- `@NubbyGPT summarize this week`
- `@NubbyGPT summarize last 3 hours`
- `@NubbyGPT tldr`

### Slash Commands
- `/backfill` - Archive all historical messages (admin only)
- `/profile @user` - View a user's AI-generated profile
- `/profile @user rebuild:true` - Rebuild a profile from scratch
- `/ask <question>` - Ask a question about the server

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_APP_ID` | No | Defaults to `1363093908526993509` |
| `ANTHROPIC_API_KEY` | Yes | API key from Anthropic Console |
| `DB_PATH` | No | SQLite path (defaults to `/config/db/nubbybot.db`) |
| `LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |
| `BACKFILL_BATCH_DELAY_MS` | No | Delay between backfill batches (default: `1000`) |
| `PROFILE_UPDATE_INTERVAL_HOURS` | No | Hours between profile rebuilds (default: `24`) |

## Architecture

```
src/
  index.ts                    # Entry point
  config.ts                   # Environment config
  bot/
    client.ts                 # Discord.js client setup
    events/                   # Event handlers (messageCreate, etc.)
  database/
    client.ts                 # SQLite connection (better-sqlite3)
    migrations.ts             # Schema + FTS5 setup
    repositories/             # Data access layer
  services/
    archiveService.ts         # Message archiving
    backfillService.ts        # Historical message fetching
    profileService.ts         # AI profile generation
  ai/
    claude.ts                 # Anthropic client
    promptTemplates.ts        # System prompts
    contextBuilder.ts         # Query context assembly
    queryHandler.ts           # @mention + summarize handling
  commands/
    register.ts               # Slash command registration
```
