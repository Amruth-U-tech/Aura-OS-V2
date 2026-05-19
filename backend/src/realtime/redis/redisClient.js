const Redis = require('ioredis');

// ======================================================
// REDIS CLIENT — Phase D3.2.1
// Singleton Redis connections with fault isolation
//
// Owns: connection lifecycle, reconnect strategy, health
// Must NOT: store durable truth (Mongo owns that)
//
// Creates TWO isolated connections:
//   1. main — for commands (streams, hashes, gets/sets)
//   2. sub  — for pub/sub subscriber (dedicated per Redis docs)
//
// Fault isolation: Redis failure must NEVER crash Express.
// All Redis operations degrade gracefully.
// ======================================================

let _main = null;
let _sub = null;

const _metrics = {
  connectCount: 0,
  reconnectCount: 0,
  disconnectCount: 0,
  errorCount: 0,
  lastConnectedAt: null,
  lastErrorAt: null,
  lastError: null,
};

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const CONNECTION_OPTS = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    if (times > 20) {
      console.error(`[Redis] ❌ Max retries exceeded (${times}). Giving up.`);
      return null; // stop retrying
    }
    const delay = Math.min(times * 200, 5000);
    console.warn(`[Redis] ⚠️ Reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  reconnectOnError: (err) => {
    const targetErrors = ['READONLY', 'ECONNRESET'];
    return targetErrors.some(e => err.message.includes(e));
  },
  lazyConnect: true, // Don't connect until first command
  enableReadyCheck: true,
};

// ── Create a Redis connection with lifecycle logging ──
function _createConnection(name) {
  const conn = new Redis(REDIS_URL, {
    ...CONNECTION_OPTS,
    connectionName: `aura-${name}`,
  });

  conn.on('connect', () => {
    _metrics.connectCount++;
    _metrics.lastConnectedAt = Date.now();
    console.log(`[Redis:${name}] ✅ Connected`);
  });

  conn.on('ready', () => {
    console.log(`[Redis:${name}] ✅ Ready`);
  });

  conn.on('error', (err) => {
    _metrics.errorCount++;
    _metrics.lastErrorAt = Date.now();
    _metrics.lastError = err.message;
    // FAULT ISOLATION: log but never throw
    console.error(`[Redis:${name}] ❌ Error: ${err.message}`);
  });

  conn.on('close', () => {
    _metrics.disconnectCount++;
    console.warn(`[Redis:${name}] ⚠️ Connection closed`);
  });

  conn.on('reconnecting', (ms) => {
    _metrics.reconnectCount++;
    console.warn(`[Redis:${name}] 🔄 Reconnecting in ${ms}ms`);
  });

  return conn;
}

// ── Get or create main connection ─────────────────────
function getClient() {
  if (!_main) {
    _main = _createConnection('main');
  }
  return _main;
}

// ── Get or create sub connection ──────────────────────
function getSubscriber() {
  if (!_sub) {
    _sub = _createConnection('sub');
  }
  return _sub;
}

// ── Connect both clients (call at server boot) ────────
async function connect() {
  try {
    const main = getClient();
    const sub = getSubscriber();
    await main.connect();
    await sub.connect();
    console.log('[Redis] ✅ Both connections established');
    return true;
  } catch (err) {
    console.error(`[Redis] ❌ Connection failed: ${err.message}`);
    console.warn('[Redis] ⚠️ System will operate in degraded mode (no Redis coordination)');
    return false;
  }
}

// ── Graceful disconnect ───────────────────────────────
async function disconnect() {
  try {
    if (_main) { _main.disconnect(); _main = null; }
    if (_sub) { _sub.disconnect(); _sub = null; }
    console.log('[Redis] 🔌 Disconnected');
  } catch (err) {
    console.error(`[Redis] ❌ Disconnect error: ${err.message}`);
  }
}

// ── Health check ──────────────────────────────────────
async function isHealthy() {
  try {
    const client = getClient();
    if (client.status !== 'ready') return false;
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

// ── Metrics ───────────────────────────────────────────
function getMetrics() {
  return {
    ..._metrics,
    mainStatus: _main?.status || 'not_created',
    subStatus: _sub?.status || 'not_created',
  };
}

module.exports = {
  getClient,
  getSubscriber,
  connect,
  disconnect,
  isHealthy,
  getMetrics,
};
