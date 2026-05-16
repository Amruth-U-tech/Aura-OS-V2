import { eventBus } from '@systems/eventBus';

// ======================================================
// MISSION EVENT BUS
// Owns: mission-specific event dispatching
// Decouples TaskContext from individual components
// ======================================================

export const MISSION_EVENTS = {
  CREATED: 'mission:created',
  COMPLETED: 'mission:completed',
  CANCELLED: 'mission:cancelled',
  FAILED: 'mission:failed',
  EXPIRED: 'mission:expired',
  SYNC_REQUESTED: 'mission:sync_requested'
};

export const missionEventBus = {
  emit: (event, data) => eventBus.emit(event, data),
  on: (event, cb) => eventBus.on(event, cb),
  off: (event, cb) => eventBus.off(event, cb)
};
