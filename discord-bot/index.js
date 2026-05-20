// ======================================================
// DISCORD BOT — Phase D3.2.2
// Standalone process: NOT part of Express server
//
// Shares: MongoDB and Redis with the backend
// Communicates: via Redis pub/sub and Redis Streams
//
// Boot sequence:
//   1. Load env
//   2. Connect Redis
//   3. Connect MongoDB
//   4. Connect Discord gateway
//   5. Subscribe bot:commands
//   6. Register gateway handlers
//   7. Start health heartbeat
//   8. Ready state
//
// Fault isolation:
//   - Bot crash does NOT crash the API
//   - API crash does NOT crash the bot
//   - Redis failure degrades gracefully
// ======================================================

// ── Force Google DNS for MongoDB Atlas SRV lookup ─────
// Fixes: querySrv ECONNREFUSED _mongodb._tcp.cluster0.xxx
// Root cause: system DNS resolver cannot resolve SRV records
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

require('dotenv').config({ path: require('path').resolve(__dirname, '../backend/.env') });

const { Client, GatewayIntentBits, Events } = require('discord.js');
const Redis = require('ioredis');
const mongoose = require('mongoose');

// ── Gateway handlers ──────────────────────────────────
const messageHandler = require('./gateway/messageHandler');
const voiceHandler = require('./gateway/voiceHandler');
const memberHandler = require('./gateway/memberHandler');

// ── Validate required env ─────────────────────────────
const REQUIRED_ENV = ['DISCORD_BOT_TOKEN', 'MONGO_URI'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[Bot] ❌ Missing required env: ${key}`);
    process.exit(1);
  }
}

// Use DISCORD_BOT_TOKEN if set, otherwise fall back to DISCORD_MASTER_TOKEN
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_MASTER_TOKEN;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const BOT_COMMAND_CHANNEL = process.env.BOT_REDIS_COMMAND_CHANNEL || 'bot:commands';

// ── Discord client ────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
  ],
});

// ── Redis connections ─────────────────────────────────
let redis = null;
let redisSub = null;

// ── Health state ──────────────────────────────────────
const health = {
  discordReady: false,
  redisReady: false,
  mongoReady: false,
  bootedAt: null,
  lastHeartbeat: null,
  errors: [],
};

function logError(context, err) {
  const entry = { context, message: err.message, at: new Date().toISOString() };
  health.errors.push(entry);
  if (health.errors.length > 50) health.errors.shift();
  console.error(`[Bot:${context}] ❌ ${err.message}`);
}

// ── Boot sequence ─────────────────────────────────────
async function boot() {
  console.log('[Bot] 🚀 Starting Aura Discord Bot...');

  // Step 1: Redis
  try {
    redis = new Redis(REDIS_URL, { connectionName: 'bot-main', maxRetriesPerRequest: 3, lazyConnect: true });
    redisSub = new Redis(REDIS_URL, { connectionName: 'bot-sub', maxRetriesPerRequest: 3, lazyConnect: true });
    await redis.connect();
    await redisSub.connect();
    health.redisReady = true;
    console.log('[Bot] ✅ Redis connected');
  } catch (err) {
    logError('redis', err);
    console.warn('[Bot] ⚠️ Running without Redis — degraded mode');
  }

  // Step 2: MongoDB (shared DB with backend)
  // Pre-check: verify DNS can resolve the Atlas hostname before connecting
  const MONGO_CONNECT_RETRIES = 3;
  for (let attempt = 1; attempt <= MONGO_CONNECT_RETRIES; attempt++) {
    try {
      if (mongoose.connection.readyState === 0) {
        console.log(`[Bot] 🔗 MongoDB connect attempt ${attempt}/${MONGO_CONNECT_RETRIES}...`);
        await mongoose.connect(process.env.MONGO_URI, {
          serverSelectionTimeoutMS: 15000,
          connectTimeoutMS: 15000,
          socketTimeoutMS: 30000,
          family: 4, // Force IPv4 — avoids IPv6 DNS issues
        });
      }
      health.mongoReady = true;
      console.log('[Bot] ✅ MongoDB connected');
      break;
    } catch (err) {
      logError('mongo', err);
      if (attempt < MONGO_CONNECT_RETRIES) {
        console.warn(`[Bot] ⚠️ Retrying MongoDB in 3s... (attempt ${attempt}/${MONGO_CONNECT_RETRIES})`);
        await new Promise(r => setTimeout(r, 3000));
      } else {
        console.error('[Bot] ❌ MongoDB connection failed after all retries — bot cannot operate');
        process.exit(1);
      }
    }
  }

  // Step 3: Subscribe to bot:commands
  if (health.redisReady) {
    try {
      await redisSub.subscribe(BOT_COMMAND_CHANNEL);
      redisSub.on('message', (channel, message) => {
        if (channel !== BOT_COMMAND_CHANNEL) return;
        try {
          const cmd = JSON.parse(message);
          handleBotCommand(cmd);
        } catch (err) {
          logError('command-parse', err);
        }
      });
      console.log(`[Bot] ✅ Subscribed to ${BOT_COMMAND_CHANNEL}`);
    } catch (err) {
      logError('pubsub', err);
    }
  }

  // Step 4: Register Discord gateway handlers
  client.on(Events.MessageCreate, (msg) => {
    try { messageHandler.handle(msg, redis); }
    catch (err) { logError('messageCreate', err); }
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    try { voiceHandler.handle(oldState, newState, redis); }
    catch (err) { logError('voiceState', err); }
  });

  client.on(Events.GuildMemberAdd, (member) => {
    try { memberHandler.handleJoin(member); }
    catch (err) { logError('memberAdd', err); }
  });

  client.on(Events.GuildMemberRemove, (member) => {
    try { memberHandler.handleRemove(member); }
    catch (err) { logError('memberRemove', err); }
  });

  client.on(Events.Error, (err) => logError('discord-error', err));

  // Step 5: Login to Discord
  try {
    await client.login(BOT_TOKEN);
    health.discordReady = true;
    health.bootedAt = Date.now();
    console.log(`[Bot] ✅ Discord bot logged in as ${client.user?.tag}`);
  } catch (err) {
    logError('discord-login', err);
    console.error('[Bot] ❌ Discord login failed');
    process.exit(1);
  }

  // Step 6: Health heartbeat
  setInterval(() => {
    health.lastHeartbeat = Date.now();
    if (redis && redis.status === 'ready') {
      redis.set('bot:heartbeat', Date.now(), 'EX', 120).catch(() => {});
    }
  }, 30000);

  console.log('[Bot] ✅ Aura Discord Bot is READY');
}

// ── Handle incoming bot commands from backend ─────────
function handleBotCommand(cmd) {
  console.log(`[Bot] 📩 Command received: ${cmd.type || 'unknown'}`);
  // Future: CHALLENGE_ANNOUNCE, HUB_PROVISION, etc.
}

// ── Graceful shutdown ─────────────────────────────────
process.on('SIGINT', async () => {
  console.log('[Bot] 🔌 Shutting down...');
  client.destroy();
  if (redis) redis.disconnect();
  if (redisSub) redisSub.disconnect();
  await mongoose.disconnect();
  process.exit(0);
});

process.on('unhandledRejection', (err) => {
  logError('unhandledRejection', err);
});

boot();
