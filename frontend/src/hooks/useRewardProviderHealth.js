import { useState, useEffect } from 'react';
import rewardApi from '@services/rewardApi';

// ======================================================
// useRewardProviderHealth — polls reward provider health
// ======================================================

const useRewardProviderHealth = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        setLoading(true);
        const data = await rewardApi.checkHealth();
        if (!cancelled) setHealth(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Reward provider health check failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  return { health, loading, error };
};

export default useRewardProviderHealth;
