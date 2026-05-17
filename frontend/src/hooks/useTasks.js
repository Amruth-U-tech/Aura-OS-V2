import { useCallback, useEffect, useRef } from 'react';
import taskApi from '@services/taskApi';
import { useTaskContext } from '@context/TaskContext';
import { useAuth } from '@context/AuthContext';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { reconnectCoordinator } from '@systems/reconnectCoordinator';

// ======================================================
// USE TASKS HOOK — Phase 3.1.2 (Hardened)
// Owns: frontend mission synchronization orchestration
//
// Phase 3.1.2 changes:
//   - ALL fetches routed through fetchOrchestrator
//   - Single-flight dedup prevents concurrent /tasks calls
//   - Cooldown window (5s) prevents fetch storms
//   - Rate-limit backoff (429) handled centrally
//   - mountedRef prevents setState-after-unmount
//
// Guards: will NOT execute until authReady && user exist
// Must NOT: determine lifecycle truth
// ======================================================

export const useTasks = (filters = {}) => {
  const { missions, loading, error, setLoading, setMissions, addMission, updateMission, setError } =
    useTaskContext();
  const { user, authReady } = useAuth();
  const filterKey = JSON.stringify(filters);

  const mountedRef = useRef(true);

  // ── Orchestrated fetch ────────────────────────────
  // Uses fetchOrchestrator to guarantee:
  //   - Only 1 /tasks call at a time (single-flight)
  //   - No calls within 5s of last successful fetch (cooldown)
  //   - Exponential backoff on 429 (rate-limit)
  const fetchMissions = useCallback(async (options = {}) => {
    if (!authReady || !user) return;

    setLoading(true);
    try {
      const data = await fetchOrchestrator.fetch(
        `tasks.list.${filterKey}`,
        () => taskApi.getAll(filters),
        { cooldownMs: 5000, ...options }
      );

      if (mountedRef.current) {
        if (data !== null) {
          // data === null means cooldown skip (no new data)
          setMissions(Array.isArray(data) ? data : []);
        } else {
          // Cooldown skip — just clear loading state
          setLoading(false);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        if (err?.type === 'rate_limited') {
          // Silently skip — orchestrator handles backoff
          setLoading(false);
          return;
        }
        if (err?.status === 401) {
          setError('Session expired. Please sign in again.');
        } else {
          setError(err?.message || 'Failed to fetch missions');
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user, filterKey, setLoading, setMissions, setError]);

  // Phase 3.1.4: Skip initial load if ReconnectCoordinator is handling hydration
  useEffect(() => {
    mountedRef.current = true;
    if (!reconnectCoordinator.isHydrating()) {
      void fetchMissions();
    }
    return () => { mountedRef.current = false; };
  }, [fetchMissions]);

  // Phase 3.1.3: Register with ReconnectCoordinator
  useEffect(() => {
    if (!authReady || !user) return;
    reconnectCoordinator.registerHydrator('tasks', () => fetchMissions({ force: true, cooldownMs: 0 }));
    return () => reconnectCoordinator.unregisterHydrator('tasks');
  }, [authReady, user, fetchMissions]);

  // ── Create mission ─────────────────────────────────
  const createMission = useCallback(async (missionData) => {
    const mission = await taskApi.create(missionData);
    addMission(mission);
    return mission;
  }, [addMission]);

  // ── Complete (optimistic + rollback) ───────────────
  const completeMission = useCallback(async (id) => {
    const prev = missions.find(m => m._id === id);
    if (prev) updateMission({ ...prev, status: 'COMPLETED', completedAt: new Date().toISOString() });
    try {
      const updated = await taskApi.complete(id);
      updateMission(updated);
    } catch (err) {
      if (prev) updateMission(prev); // Rollback
      throw err;
    }
  }, [missions, updateMission]);

  // ── Cancel (optimistic + rollback) ────────────────
  const cancelMission = useCallback(async (id) => {
    const prev = missions.find(m => m._id === id);
    if (prev) updateMission({ ...prev, status: 'CANCELLED', cancelledAt: new Date().toISOString() });
    try {
      const updated = await taskApi.cancel(id);
      updateMission(updated);
    } catch (err) {
      if (prev) updateMission(prev);
      throw err;
    }
  }, [missions, updateMission]);

  // ── Fail (optimistic + rollback) ──────────────────
  const failMission = useCallback(async (id) => {
    const prev = missions.find(m => m._id === id);
    if (prev) updateMission({ ...prev, status: 'FAILED', failedAt: new Date().toISOString() });
    try {
      const updated = await taskApi.fail(id);
      updateMission(updated);
    } catch (err) {
      if (prev) updateMission(prev);
      throw err;
    }
  }, [missions, updateMission]);

  return {
    missions,
    loading,
    error,
    fetchMissions,
    createMission,
    completeMission,
    cancelMission,
    failMission
  };
};
