import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import authApi from '@services/authApi';

// ======================================================
// DISCORD CALLBACK PAGE — Phase D1.DEBUG
//
// Handles TWO callback flows:
//
// FLOW A — SPA (primary, when DISCORD_REDIRECT_URI = frontend):
//   1. Discord redirects to this page with ?code=X&state=Y
//   2. This page extracts code + state
//   3. POSTs {code, state} to backend /auth/discord/exchange
//   4. Backend exchanges code for tokens, returns {token, user}
//   5. AuthContext stores JWT → session active
//
// FLOW B — Server redirect (fallback, when DISCORD_REDIRECT_URI = backend):
//   1. Backend already exchanged code → redirects here with ?token=X&user=Y
//   2. This page captures token + user from URL
//   3. AuthContext stores JWT → session active
//
// AUTO-DETECTION:
//   URL has `code` param → Flow A (SPA exchange)
//   URL has `token` param → Flow B (server redirect)
//   URL has `error` param → error display
//
// SECURITY: URL params cleared immediately after capture
// ======================================================

const DiscordCallbackPage = () => {
  const [searchParams] = useSearchParams();
  const { handleDiscordCallback, isAuthenticated, authReady } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('processing');
  const [statusDetail, setStatusDetail] = useState('Initializing...');
  const [error, setError] = useState(null);
  const exchangeAttempted = useRef(false);

  useEffect(() => {
    // Prevent duplicate execution (React strict mode / re-renders)
    if (exchangeAttempted.current) return;

    // If already authenticated, just redirect
    if (authReady && isAuthenticated) {
      navigate('/', { replace: true });
      return;
    }

    // Check for error from Discord or backend
    const errorParam = searchParams.get('error');
    if (errorParam) {
      console.error('[OAuth Callback] Error received:', errorParam);
      setStatus('error');
      setError(
        errorParam === 'access_denied'
          ? 'Discord authorization was denied — please try again'
          : errorParam === 'invalid_state'
          ? 'Security validation failed — please try logging in again'
          : errorParam === 'missing_code'
          ? 'Discord did not return an authorization code'
          : decodeURIComponent(errorParam)
      );
      return;
    }

    // ── DETECT FLOW TYPE ─────────────────────────────
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const token = searchParams.get('token');
    const userParam = searchParams.get('user');

    if (code) {
      // FLOW A — SPA code exchange
      console.info('[OAuth Callback] Flow A: SPA exchange — code present, initiating backend exchange');
      handleSPAExchange(code, state);
    } else if (token && userParam) {
      // FLOW B — Server redirect (token already in URL)
      console.info('[OAuth Callback] Flow B: Server redirect — token present');
      handleServerRedirect(token, userParam);
    } else {
      // Neither flow matched
      console.error('[OAuth Callback] No code or token in URL — params:', Object.fromEntries(searchParams));
      setStatus('error');
      setError('Missing authentication data — please try logging in again');
    }

    // Mark as attempted to prevent duplicate exchanges
    exchangeAttempted.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // Empty deps: run exactly once on mount

  // ═══════════════════════════════════════════════════
  // FLOW A — SPA Code Exchange
  // ═══════════════════════════════════════════════════
  const handleSPAExchange = async (code, state) => {
    // Recover state from sessionStorage if not in URL
    const effectiveState = state || (() => {
      try { return sessionStorage.getItem('discord_oauth_state'); }
      catch { return null; }
    })();

    if (!effectiveState) {
      console.error('[OAuth Callback] No state token available — CSRF protection failed');
      setStatus('error');
      setError('Security token missing — please try logging in again');
      return;
    }

    setStatusDetail('Exchanging authorization code...');

    try {
      console.info('[OAuth Callback] POSTing code exchange to backend...');
      const result = await authApi.exchangeDiscordCode(code, effectiveState);

      console.info('[OAuth Callback] Exchange successful — received JWT + user');
      setStatusDetail('Setting up your session...');

      // Normalize the response
      const auraToken = result?.token;
      const auraUser = result?.user;
      const isNewUser = result?.isNewUser || false;

      if (!auraToken || !auraUser) {
        console.error('[OAuth Callback] Backend returned incomplete data:', { hasToken: !!auraToken, hasUser: !!auraUser });
        setStatus('error');
        setError('Backend returned incomplete authentication data');
        return;
      }

      // Store in AuthContext
      const success = handleDiscordCallback(auraToken, auraUser, isNewUser);
      if (success) {
        setStatus('success');
        setStatusDetail(isNewUser ? 'Account created!' : 'Welcome back!');
        // Clear URL params (security)
        window.history.replaceState({}, document.title, '/auth/discord/callback');
        // Clean up stored state
        try { sessionStorage.removeItem('discord_oauth_state'); } catch {}
        // Redirect to dashboard
        setTimeout(() => navigate('/', { replace: true }), 800);
      } else {
        setStatus('error');
        setError('Failed to initialize session — token may be invalid');
      }
    } catch (err) {
      console.error('[OAuth Callback] Code exchange failed:', err);
      setStatus('error');
      setError(err?.message || err?.data?.message || 'Authentication failed — please try again');
    }
  };

  // ═══════════════════════════════════════════════════
  // FLOW B — Server Redirect (token already in URL)
  // ═══════════════════════════════════════════════════
  const handleServerRedirect = (token, userParam) => {
    try {
      const user = JSON.parse(decodeURIComponent(userParam));
      const isNew = searchParams.get('isNew') === 'true';

      const success = handleDiscordCallback(token, user, isNew);
      if (success) {
        setStatus('success');
        setStatusDetail(isNew ? 'Account created!' : 'Welcome back!');
        window.history.replaceState({}, document.title, '/auth/discord/callback');
        setTimeout(() => navigate('/', { replace: true }), 800);
      } else {
        setStatus('error');
        setError('Authentication failed — invalid token');
      }
    } catch (err) {
      console.error('[OAuth Callback] Server redirect parsing failed:', err);
      setStatus('error');
      setError(err?.message || 'Failed to process authentication data');
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.orb1} />
      <div style={styles.orb2} />

      <div style={styles.card}>
        <div style={styles.brand}>
          <span style={styles.brandIcon}>⚔️</span>
          <span style={styles.brandName}>Aura OS</span>
        </div>

        {status === 'processing' && (
          <div style={styles.statusContainer}>
            <div style={styles.spinner} />
            <p style={styles.statusText}>Authenticating with Discord...</p>
            <p style={styles.subText}>{statusDetail}</p>
          </div>
        )}

        {status === 'success' && (
          <div style={styles.statusContainer}>
            <span style={styles.successIcon}>✅</span>
            <p style={styles.statusText}>{statusDetail}</p>
            <p style={styles.subText}>Redirecting to dashboard...</p>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.statusContainer}>
            <span style={styles.errorIcon}>❌</span>
            <p style={styles.errorText}>Authentication Failed</p>
            <p style={styles.subText}>{error}</p>
            <button
              style={styles.retryBtn}
              onClick={() => navigate('/auth', { replace: true })}
            >
              ← Back to Login
            </button>
          </div>
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
    display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
  },
  brand: { display: 'flex', alignItems: 'center', gap: '0.6rem' },
  brandIcon: { fontSize: '1.5rem' },
  brandName: { fontSize: '1.25rem', fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' },
  statusContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem',
    padding: '1rem 0'
  },
  spinner: {
    width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)',
    borderTop: '3px solid #5865F2', borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  statusText: {
    color: '#fff', fontSize: '1.1rem', fontWeight: 600, margin: 0, textAlign: 'center'
  },
  subText: {
    color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem', margin: 0, textAlign: 'center'
  },
  successIcon: { fontSize: '2rem' },
  errorIcon: { fontSize: '2rem' },
  errorText: {
    color: '#ff6b6b', fontSize: '1.1rem', fontWeight: 600, margin: 0, textAlign: 'center'
  },
  retryBtn: {
    marginTop: '0.5rem', padding: '0.6rem 1.5rem',
    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '10px', color: '#fff', fontSize: '0.9rem', cursor: 'pointer',
    transition: 'all 0.2s'
  }
};

export default DiscordCallbackPage;
