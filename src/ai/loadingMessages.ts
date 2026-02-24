import type { Message } from 'discord.js';
import { logger } from '../utils/logger.js';

// Random loading messages shown while the bot is thinking.
// Displayed in the reply, then rotated every ~2s until the real answer is ready.

const LOADING_MESSAGES = [
  // Generic thinking
  'thinking...',
  'one sec...',
  'hold on...',
  'processing...',
  'noodling on this...',
  'hang on...',
  'let me check...',
  'pulling up the archives...',
  'digging through the logs...',
  'searching...',
  'calculating...',
  'consulting the database...',
  'reading the room...',
  'checking my notes...',
  'parsing that...',
  'running the numbers...',
  'loading context...',
  'crunching data...',
  'sifting through messages...',
  'scanning the archives...',
  'cross-referencing...',
  'indexing memories...',
  'querying the hive mind...',
  'warming up the neurons...',
  'buffering...',
  'defragmenting my thoughts...',
  'compiling an answer...',
  'accessing long-term storage...',

  // Halo references
  'wort wort wort...',
  'finishing the fight...',
  'sending in the ODSTs...',
  'activating the index...',
  'chief, I need a moment...',
  'warthog is inbound...',
  'teabagging the search results...',
  'requesting MAC round, standby...',
  'cortana is processing...',
  'performing a combat evolved...',
  'charging the spartan laser...',
  'waiting for the pelican...',
  'running a slayer match on your question...',
  'flag captured, returning to base...',
  'betrayal! ...wait, wrong context...',
  'overshield charging...',

  // Arc Raiders references
  'scanning the arc...',
  'evading the machines...',
  'scavenging for answers...',
  'the arc sees everything...',
  'deploying extraction team...',
  'raiding the data vaults...',

  // Destiny references
  'whether we wanted it or not...',
  'ghost is scanning...',
  'checking the loot pool...',
  'decrypting engram...',
  'eyes up, guardian...',

  // Minecraft references
  'mining for answers...',
  'crafting a response...',
  'enchanting the query...',
  'breaking bedrock...',

  // Valorant references
  'checking angles...',
  'defusing the question...',
  'rotating to site...',
  'sage wall is up, one sec...',

  // Elden Ring / Souls references
  'try finger, but hole...',
  'seeking grace...',
  'consulting the erdtree...',
  'you died... jk, loading...',

  // General gaming
  'respawning in 3... 2... 1...',
  'save scumming through the archives...',
  'speed running this query...',
  'entering god mode...',
  'loading next checkpoint...',
  'fast traveling to the answer...',
  'switching weapons...',
  'AFK for a sec...',
  'inserting coin to continue...',
  'selecting character...',
  'matchmaking...',
  'waiting for the lobby...',
  'rage quitting... just kidding...',
  'GG loading...',
  'clutching the answer...',
  'third-partied by your question...',
  'looting the data...',
  'headglitching the database...',
  'bunny hopping to the answer...',
  'wall running through the logs...',
  'ulting...',
  'popping smoke...',
  'calling in an airstrike on this question...',
  'reviving the context...',
  'dropping hot on your query...',
  'pinging the answer...',
];

const ERROR_MESSAGES = [
  'something broke. try again?',
  'oof, that didn\'t work. hit me again.',
  'error 404: answer not found. try again.',
  'my brain lagged out. one more time?',
  'that one timed out on me. retry?',
  'dropped the ball. ask again?',
  'connection lost to the mothership. try again.',
  'welp, that failed. go again?',
  'I choked. give it another shot.',
  'timed out. the archives fought back.',
  'ran into a wall. literally. try again?',
  'the database said no. try rephrasing?',
  'skill issue on my end. retry?',
  'I crashed harder than a warthog off a cliff. again?',
  'response got lost in the warp. try again.',
  'that query wiped my squad. go again?',
  'bruh I just died to fall damage. retry?',
  'server-side fumble. one more?',
  'my ghost couldn\'t revive that one. again?',
  'got third-partied by an error. retry?',
  'the architects got me. try again.',
  'I\'ve been downed. revive with a retry?',
  'lost connection to the answer. try again.',
  'that one desynced. hit me again?',
  'critical hit... on myself. retry?',
  'the search party got ambushed. go again?',
  'respawn failed. try asking again.',
  'out of ammo on that one. reload and retry?',
  'game crashed. reboot with another question?',
  'that query rage quit. try again.',
];

function getLoadingMessage(): string {
  return LOADING_MESSAGES[Math.floor(Math.random() * LOADING_MESSAGES.length)];
}

function getUniqueLoadingMessages(count: number): string[] {
  const shuffled = [...LOADING_MESSAGES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

export function getErrorMessage(): string {
  return ERROR_MESSAGES[Math.floor(Math.random() * ERROR_MESSAGES.length)];
}

const ROTATE_INTERVAL_MS = 2_000;
const TIMEOUT_MS = 30_000;

/**
 * Sends a loading message reply and rotates it every 2s.
 * Returns a handle to stop rotation and access the message.
 * Auto-stops after TIMEOUT_MS and edits with an error message.
 */
export function startLoadingReply(message: Message): {
  stop: () => void;
  getMessage: () => Message | null;
  timedOut: () => boolean;
} {
  let loadingMsg: Message | null = null;
  let stopped = false;
  let didTimeout = false;
  let rotateTimer: ReturnType<typeof setInterval> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Pick 5 unique messages to cycle through
  const phrases = getUniqueLoadingMessages(5);
  let phraseIndex = 0;

  // Send initial loading message
  const sendPromise = message.reply(phrases[0]).then(msg => {
    loadingMsg = msg;

    if (stopped) return; // Already stopped before we even sent

    // Start rotating every 2s
    phraseIndex = 1;
    rotateTimer = setInterval(() => {
      if (stopped || !loadingMsg) return;
      const nextPhrase = phrases[phraseIndex % phrases.length];
      phraseIndex++;
      loadingMsg.edit(nextPhrase).catch(() => {
        // Silently fail on edit errors (message deleted, etc.)
      });
    }, ROTATE_INTERVAL_MS);

    // Set timeout
    timeoutTimer = setTimeout(() => {
      if (stopped) return;
      didTimeout = true;
      stopped = true;
      if (rotateTimer) clearInterval(rotateTimer);
      if (loadingMsg) {
        loadingMsg.edit(getErrorMessage()).catch(() => {});
      }
    }, TIMEOUT_MS);
  }).catch(err => {
    logger.warn('Failed to send loading message', { error: err });
  });

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      if (rotateTimer) clearInterval(rotateTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
    },
    getMessage() {
      return loadingMsg;
    },
    timedOut() {
      return didTimeout;
    },
  };
}
