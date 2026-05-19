const redisClient = require('./redisClient');
const redisStreams = require('./redisStreams');
const redisPresence = require('./redisPresence');
const redisPubSub = require('./redisPubSub');

// ======================================================
// REDIS HEALTH — Phase D3.2.1
// Runtime observability for Redis coordination layer
//
// Exposes: latency, status, metrics from all Redis modules
// ======================================================

const _healthHistory = [];
const MAX_HISTORY = 100;

async function checkHealth() {
  const start = Date.now();
  const healthy = await redisClient.isHealthy();
  const latencyMs = Date.now() - start;

  const snapshot = {
    healthy,
    latencyMs,
    checkedAt: Date.now(),
    client: redisClient.getMetrics(),
    streams: redisStreams.getMetrics(),
    presence: redisPresence.getMetrics(),
    pubsub: redisPubSub.getMetrics(),
  };

  _healthHistory.push(snapshot);
  if (_healthHistory.length > MAX_HISTORY) _healthHistory.shift();

  return snapshot;
}

function getHistory() {
  return _healthHistory.slice(-20);
}

function getFullMetrics() {
  return {
    client: redisClient.getMetrics(),
    streams: redisStreams.getMetrics(),
    presence: redisPresence.getMetrics(),
    pubsub: redisPubSub.getMetrics(),
    history: _healthHistory.slice(-5),
  };
}

module.exports = { checkHealth, getHistory, getFullMetrics };
