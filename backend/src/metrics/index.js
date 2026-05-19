// ======================================================
// METRICS AGGREGATOR — Phase N2
// Central access point for all system metrics
// ======================================================

const eventMetrics = require('./eventMetrics');
const socketMetrics = require('./socketMetrics');
const sequenceManager = require('../events/sequenceManager');
const replayBuffer = require('../events/replayBuffer');

const getSystemMetrics = () => ({
  events: eventMetrics.getMetrics(),
  sockets: socketMetrics.getMetrics(),
  sequence: sequenceManager.stats(),
  replayBuffer: replayBuffer.stats(),
  process: {
    uptime: process.uptime(),
    memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    pid: process.pid
  },
  timestamp: new Date().toISOString()
});

module.exports = { getSystemMetrics, eventMetrics, socketMetrics };
