import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App';

// ======================================================
// ENTRY POINT
// React rendering bootstrap
// Phase 2.4.3: StrictMode disabled to prevent double
// effect execution that causes duplicate API calls
// ======================================================

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
);
