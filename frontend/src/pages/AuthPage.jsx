import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import LoginForm from '@components/auth/LoginForm';
import RegisterForm from '@components/auth/RegisterForm';

// ======================================================
// AUTH PAGE — Phase D1
// Discord-first federated authentication entry point
// Primary: "Continue with Discord" button
// Fallback: local email/password (collapsed by default)
// Must NOT: contain auth logic — delegates to AuthContext
// ======================================================

const AuthPage = () => {
  const { isAuthenticated, authReady, loginWithDiscord, authError } = useAuth();
  const [showLocalAuth, setShowLocalAuth] = useState(false);
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [discordLoading, setDiscordLoading] = useState(false);

  // Redirect if already authenticated
  if (authReady && isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  // Wait for auth restoration
  if (!authReady) {
    return (
      <div style={styles.loader}>
        <span>Initializing...</span>
      </div>
    );
  }

  const handleDiscordLogin = async () => {
    setDiscordLoading(true);
    await loginWithDiscord();
    // Note: loginWithDiscord redirects the browser — this state won't persist
  };

  return (
    <div style={styles.page}>
      {/* Background gradient orbs */}
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.card}>
        {/* Brand */}
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⚔️</span>
          <span style={styles.brandName}>Aura OS</span>
        </div>

        <p style={styles.tagline}>Behavioral Mastery Platform</p>

        {/* Error display */}
        {authError && (
          <div style={styles.errorBanner}>
            ❌ {authError}
          </div>
        )}

        {/* ── Discord Login (Primary) ───────────────── */}
        <button
          id="discord-login-btn"
          style={{
            ...styles.discordBtn,
            ...(discordLoading ? styles.discordBtnLoading : {})
          }}
          onClick={handleDiscordLogin}
          disabled={discordLoading}
        >
          <svg style={styles.discordIcon} viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/>
          </svg>
          {discordLoading ? 'Redirecting to Discord...' : 'Continue with Discord'}
        </button>

        {/* ── Divider ───────────────────────────────── */}
        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* ── Local Auth Toggle ─────────────────────── */}
        {!showLocalAuth ? (
          <button
            style={styles.localToggle}
            onClick={() => setShowLocalAuth(true)}
          >
            Use email & password instead
          </button>
        ) : (
          <>
            {mode === 'login'
              ? <LoginForm onSwitch={() => setMode('register')} />
              : <RegisterForm onSwitch={() => setMode('login')} />
            }
          </>
        )}
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
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(88,101,242,0.18) 0%, transparent 70%)',
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
    display: 'flex', flexDirection: 'column', gap: '1.25rem',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
  },
  brand: { display: 'flex', alignItems: 'center', gap: '0.6rem', justifyContent: 'center' },
  brandIcon: { fontSize: '1.8rem' },
  brandName: { fontSize: '1.5rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' },
  tagline: {
    color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', textAlign: 'center',
    margin: '-0.5rem 0 0.5rem', letterSpacing: '0.05em', textTransform: 'uppercase'
  },
  errorBanner: {
    background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)',
    borderRadius: '10px', padding: '0.75rem', color: '#ff6b6b', fontSize: '0.85rem',
    textAlign: 'center'
  },
  discordBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem',
    padding: '0.9rem 1.5rem', background: '#5865F2', border: 'none',
    borderRadius: '12px', color: '#fff', fontSize: '1rem', fontWeight: 600,
    cursor: 'pointer', transition: 'all 0.2s', width: '100%',
    boxShadow: '0 4px 15px rgba(88,101,242,0.4)'
  },
  discordBtnLoading: { opacity: 0.7, cursor: 'wait' },
  discordIcon: { width: '22px', height: '22px' },
  divider: {
    display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.25rem 0'
  },
  dividerLine: {
    flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)'
  },
  dividerText: {
    color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  localToggle: {
    background: 'none', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', padding: '0.7rem 1rem', color: 'rgba(255,255,255,0.5)',
    fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s', width: '100%'
  },
  loader: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0a0a14', color: 'rgba(255,255,255,0.4)', fontSize: '0.95rem'
  }
};

export default AuthPage;
