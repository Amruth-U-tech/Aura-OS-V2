import { useState, useEffect, useCallback } from 'react';
import disciplineApi from '@services/disciplineApi';
import { useAuth } from '@context/AuthContext';

// ======================================================
// USE DISCIPLINE STATE HOOK
// Fetches and manages local discipline UI state
// Must NOT: compute reset truth or scheduling logic
// ======================================================

export const useDisciplineState = () => {
  const { isAuthenticated } = useAuth();
  const [disciplineState, setDisciplineState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchState = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await disciplineApi.getState();
      setDisciplineState(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch discipline state');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchState();
  }, [fetchState]);

  const toggle = useCallback(async (enabled) => {
    try {
      const data = await disciplineApi.toggle(enabled);
      setDisciplineState(data);
    } catch (err) {
      setError(err.message || 'Failed to toggle discipline');
    }
  }, []);

  return { disciplineState, loading, error, toggle, refetch: fetchState };
};
