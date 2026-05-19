// ======================================================
// REDIS LAYER — Phase D3.2.1 (Barrel Export)
// ======================================================

const redisClient = require('./redisClient');
const redisStreams = require('./redisStreams');
const redisPresence = require('./redisPresence');
const redisPubSub = require('./redisPubSub');
const redisHealth = require('./redisHealth');

module.exports = {
  redisClient,
  redisStreams,
  redisPresence,
  redisPubSub,
  redisHealth,
};
