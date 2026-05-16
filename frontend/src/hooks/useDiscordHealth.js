import { useState, useEffect } from 'react';
import discordApi from '@services/discordApi';

// ======================================================
// useDiscordHealth — polls Discord integration health
// ======================================================

const useDiscordHealth = () => {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        setLoading(true);
        const data = await discordApi.checkHealth();
        if (!cancelled) setHealth(data);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Discord health check failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    check();
    return () => { cancelled = true; };
  }, []);

  return { health, loading, error };
};

export default useDiscordHealth;
