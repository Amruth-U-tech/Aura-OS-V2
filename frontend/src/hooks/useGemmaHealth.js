import { useState, useEffect } from 'react';
import gemmaApi from '@services/gemmaApi';

// ======================================================
// useGemmaHealth — polls Gemini AI integration health
// ======================================================

const useGemmaHealth = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        setLoading(true);
        const data = await gemmaApi.checkHealth();
        if (!cancelled) setHealth(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Gemma health check failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  return { health, loading, error };
};

export default useGemmaHealth;
