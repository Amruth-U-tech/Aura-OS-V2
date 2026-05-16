import { useState, useEffect } from 'react';
import uploadApi from '@services/uploadApi';

// ======================================================
// useUploadHealth — polls upload pipeline health
// ======================================================

const useUploadHealth = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        setLoading(true);
        const data = await uploadApi.checkHealth();
        if (!cancelled) setHealth(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Upload health check failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  return { health, loading, error };
};

export default useUploadHealth;
