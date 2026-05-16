import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';

// ======================================================
// PROTECTED ROUTE
// Owns: route-level auth gating
// Blocks rendering of ANY protected page until:
//   authReady === true  (restoration complete)
//   user exists         (session valid)
// Must NOT: contain business logic or auth state
// ======================================================

const ProtectedRoute = ({ children }) => {
  const { user, authReady } = useAuth();

  // ── Phase 1: Wait for session restoration ─────────
  // authReady is false only during the initial mount restoration
  // Prevents dashboard flash before redirect
  if (!authReady) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', fontSize: '1rem', opacity: 0.5, color: 'var(--text-primary, #fff)'
      }}>
        Initializing...
      </div>
    );
  }

  // ── Phase 2: Redirect unauthenticated users ────────
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // ── Phase 3: Render protected content ─────────────
  return children;
};

export default ProtectedRoute;
