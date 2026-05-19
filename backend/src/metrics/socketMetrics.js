// ======================================================
// SOCKET METRICS — Phase N2
// Socket transport observability
// NEVER blocks, NEVER throws, NEVER mutates state
// ======================================================

const _counters = {
  connections: 0,
  disconnections: 0,
  reconnections: 0,
  authFailures: 0,
  pingTimeouts: 0,
  transportUpgrades: 0,
  eventsEmitted: 0,
  roomJoins: 0,
  roomLeaves: 0,
};

const _disconnectReasons = new Map(); // reason → count

const increment = (counter) => {
  if (counter in _counters) _counters[counter]++;
};

const recordDisconnect = (reason) => {
  _disconnectReasons.set(reason, (_disconnectReasons.get(reason) || 0) + 1);
};

const getMetrics = () => ({
  counters: { ..._counters },
  disconnectReasons: Object.fromEntries(_disconnectReasons),
  timestamp: new Date().toISOString()
});

const reset = () => {
  Object.keys(_counters).forEach(k => { _counters[k] = 0; });
  _disconnectReasons.clear();
};

module.exports = { increment, recordDisconnect, getMetrics, reset };
