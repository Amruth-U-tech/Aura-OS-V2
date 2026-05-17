import { useState, useCallback } from 'react';

// ======================================================
// USE PUSH NOTIFICATIONS HOOK
// Manages browser push notification permission and display
// Must NOT: determine urgency or scheduling logic
// ======================================================

export const usePushNotifications = () => {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'unsupported'
  );

  const requestPermission = useCallback(async () => {
    if (!('Notification' in window)) return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const notify = useCallback((title, options = {}) => {
    if (permission !== 'granted') return;
    new Notification(title, options);
  }, [permission]);

  return { permission, requestPermission, notify };
};
