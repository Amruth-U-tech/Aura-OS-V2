const redisClient = require('./redisClient');

// ======================================================
// REDIS PUB/SUB — Phase D3.2.1
// Runtime IPC channels for cross-process coordination
//
// Channels:
//   bot:commands     — Backend → Bot commands
//   presence:events  — Presence lifecycle broadcasts
//   rtc:events       — RTC lifecycle broadcasts
//
// Must NOT: carry durable truth or business logic
// Must: preserve envelope metadata (traceId, sequence)
// ======================================================

const CHANNELS = {
  BOT_COMMANDS: process.env.REDIS_BOT_COMMAND_CHANNEL || 'bot:commands',
  PRESENCE_EVENTS: 'presence:events',
  RTC_EVENTS: 'rtc:events',
};

const _metrics = {
  publishCount: 0,
  publishFailures: 0,
  subscribeCount: 0,
  messageCount: 0,
};

const _handlers = new Map(); // channel → [handler]

// ── Publish to a channel ──────────────────────────────
async function publish(channel, data) {
  const redis = redisClient.getClient();
  if (redis.status !== 'ready') {
    _metrics.publishFailures++;
    console.warn(`[RedisPubSub] ⚠️ Redis not ready, dropping publish to ${channel}`);
    return false;
  }

  try {
    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    await redis.publish(channel, payload);
    _metrics.publishCount++;
    return true;
  } catch (err) {
    _metrics.publishFailures++;
    console.error(`[RedisPubSub] ❌ Publish to ${channel} failed: ${err.message}`);
    return false;
  }
}

// ── Subscribe to a channel ────────────────────────────
async function subscribe(channel, handler) {
  const sub = redisClient.getSubscriber();
  if (sub.status !== 'ready') {
    console.warn(`[RedisPubSub] ⚠️ Sub client not ready, deferring subscribe to ${channel}`);
    return false;
  }

  if (!_handlers.has(channel)) {
    _handlers.set(channel, []);
    await sub.subscribe(channel);
    _metrics.subscribeCount++;
    console.log(`[RedisPubSub] ✅ Subscribed to: ${channel}`);
  }

  _handlers.get(channel).push(handler);

  // Register the message handler once globally
  if (!sub._auraMessageHandlerAttached) {
    sub.on('message', (ch, message) => {
      _metrics.messageCount++;
      const handlers = _handlers.get(ch);
      if (!handlers || handlers.length === 0) return;

      let parsed;
      try { parsed = JSON.parse(message); }
      catch { parsed = message; }

      for (const h of handlers) {
        try { h(parsed); }
        catch (err) {
          console.error(`[RedisPubSub] ❌ Handler error on ${ch}: ${err.message}`);
        }
      }
    });
    sub._auraMessageHandlerAttached = true;
  }

  return true;
}

function getMetrics() { return { ..._metrics }; }

module.exports = { publish, subscribe, CHANNELS, getMetrics };
