import { useState, useCallback } from 'react';
import hubApi from '@services/hubApi';

// ======================================================
// useHubValidation — validates hub ID format and existence
// ======================================================

const useHubValidation = () => {
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const validate = useCallback(async (hubId) => {
    setError(null);
    setResult(null);

    // Client-side format check
    const pattern = /^AURA-HUB-[A-Z0-9]{8}$/;
    if (!pattern.test(hubId)) {
      setError('Invalid hub ID format. Expected: AURA-HUB-XXXXXXXX');
      return false;
    }

    try {
      setValidating(true);
      const data = await hubApi.validateHubId(hubId);
      setResult(data);
      return data.exists;
    } catch (err) {
      setError(err.message || 'Hub validation failed');
      return false;
    } finally {
      setValidating(false);
    }
  }, []);

  return { validate, validating, result, error };
};

export default useHubValidation;
