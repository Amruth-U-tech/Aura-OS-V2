import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import LoginForm from '@components/auth/LoginForm';
import RegisterForm from '@components/auth/RegisterForm';

// ======================================================
// AUTH PAGE
// First lifecycle entry point for unauthenticated players
// Owns: auth form toggling and post-auth redirect
// Must NOT: contain auth logic — delegates to AuthContext
// ======================================================

const AuthPage = () => {
  const { isAuthenticated, authReady } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register'

  // ── If already authenticated, redirect to dashboard ─
  if (authReady && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // ── Wait for auth restoration before rendering form ─
  if (!authReady) {
    return (
      <div style={styles.loader}>
        <span>Initializing...</span>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Background gradient orbs */}
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      {/* Auth card */}
      <div style={styles.card}>
        {/* Brand */}
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⚔️</span>
          <span style={styles.brandName}>Aura OS</span>
        </div>

        {/* Form toggle */}
        {mode === 'login'
          ? <LoginForm onSwitch={() => setMode('register')} />
          : <RegisterForm onSwitch={() => setMode('login')} />
        }
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a0a14', position: 'relative', overflow: 'hidden', padding: '1rem'
  },
  orb1: {
    position: 'absolute', top: '-20%', left: '-10%', width: '600px', height: '600px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 70%)',
    pointerEvents: 'none'
  },
  orb2: {
    position: 'absolute', bottom: '-20%', right: '-10%', width: '500px', height: '500px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)',
    pointerEvents: 'none'
  },
  card: {
    position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '20px', padding: '2.5rem', width: '100%', maxWidth: '420px',
    display: 'flex', flexDirection: 'column', gap: '1.5rem',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
  },
  brand: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  brandIcon: { fontSize: '1.5rem' },
  brandName: { fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' },
  loader: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a0a14', color: 'rgba(255,255,255,0.4)', fontSize: '0.95rem'
  }
};

export default AuthPage;
