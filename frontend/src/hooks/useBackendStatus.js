import { useState, useEffect, useRef } from 'react';
import { eventBus } from '@systems/eventBus';
import apiService from '@services/apiService';

// ======================================================
// USE BACKEND STATUS HOOK — Phase 2.4.3
// Connects to eventBus to monitor backend health safely
// Phase 2.4.3: Single check on mount, no duplicate intervals
// ======================================================

export const useBackendStatus = () => {
  const [status, setStatus] = useState('checking'); // 'online', 'offline', 'checking'
  const checkedRef = useRef(false); // Prevent duplicate initial checks

  useEffect(() => {
    const handleStatus = (data) => setStatus(data.status);

    const unsubscribeOnline = eventBus.on('backend:status', handleStatus);
    const unsubscribeOffline = eventBus.on('backend:error', () => setStatus('error'));

    // Phase 2.4.3: Single initial check with guard
    if (!checkedRef.current) {
      checkedRef.current = true;
      apiService.get('/health')
        .then(() => setStatus('online'))
        .catch(() => setStatus('offline'));
    }

    return () => {
      unsubscribeOnline();
      unsubscribeOffline();
    };
  }, []);

  return { status, isOnline: status === 'online' };
};
