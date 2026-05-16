import { useCallback, useEffect, useRef } from 'react';
import taskApi from '@services/taskApi';
import { useTaskContext } from '@context/TaskContext';
import { useAuth } from '@context/AuthContext';

// ======================================================
// USE TASKS HOOK — Phase 2.4.3
// Owns: frontend mission synchronization orchestration
// Guards: will NOT execute until authReady && user exist
// Handles: loading states, optimistic updates, rollback
// Phase 2.4.3: Idempotent effects — ref-based dedup,
// no duplicate fetches, cleanup on unmount
// Must NOT: determine lifecycle truth
// ======================================================

export const useTasks = (filters = {}) => {
  const { missions, loading, error, setLoading, setMissions, addMission, updateMission, setError } =
    useTaskContext();
  const { user, authReady } = useAuth();
  const filterKey = JSON.stringify(filters);

  // Phase 2.4.3: Ref guards for idempotent fetches
  const fetchingRef = useRef(false);
  const mountedRef = useRef(true);

  // ── Fetch missions — guarded by auth + dedup ──────
  const fetchMissions = useCallback(async () => {
    if (!authReady || !user) return; // CRITICAL: never fetch without auth
    if (fetchingRef.current) return; // Prevent duplicate concurrent fetches

    fetchingRef.current = true;
    setLoading(true);
    try {
      const data = await taskApi.getAll(filters);
      if (mountedRef.current) {
        setMissions(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      if (mountedRef.current) {
        if (err.status === 401) {
          setError('Session expired. Please sign in again.');
        } else {
          setError(err.message || 'Failed to fetch missions');
        }
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [authReady, user, filterKey]);

  useEffect(() => {
    mountedRef.current = true;
    fetchMissions();
    return () => { mountedRef.current = false; };
  }, [fetchMissions]);

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
