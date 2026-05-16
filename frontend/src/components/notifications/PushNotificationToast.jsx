import React from 'react';

// ======================================================
// PUSH NOTIFICATION TOAST
// Renders in-app notification banners
// Phase 2: will connect to notification event stream
// ======================================================

const PushNotificationToast = ({ message, urgency, onDismiss }) => {
  if (!message) return null;

  return (
    <div className={`notification-toast urgency-${urgency?.toLowerCase() || 'low'}`}>
      <span>{message}</span>
      <button onClick={onDismiss}>×</button>
    </div>
  );
};

export default PushNotificationToast;
