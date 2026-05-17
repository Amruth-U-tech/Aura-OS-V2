// ======================================================
// REALTIME INFRASTRUCTURE — Phase 3.0 (Barrel Export)
// Central index for all realtime transport modules
// Usage from any backend service:
//   const { socketEmitter } = require('./realtime');
// ======================================================

const { initializeSocketServer, shutdownSocketServer } = require('./socketServer');
const socketEmitter = require('./socketEmitter');
const socketRegistry = require('./socketRegistry');
const roomManager = require('./roomManager');

module.exports = {
  // Server lifecycle
  initializeSocketServer,
  shutdownSocketServer,
  // Event broadcasting (used by domain services)
  socketEmitter,
  // Runtime state queries (used by monitoring)
  socketRegistry,
  // Room utilities (used internally)
  roomManager
};
