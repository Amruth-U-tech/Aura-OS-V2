import { createContext, useState, useContext, useCallback, useEffect, useRef } from 'react';
import authApi from '@services/authApi';
import apiService from '@services/apiService';
import { eventBus } from '@systems/eventBus';

const AuthContext = createContext();

// ======================================================
// AUTH CONTEXT — Phase D1
// Owns: frontend authentication state + session restoration
// Phase D1: Discord federated auth primary, local auth preserved
//
// Exposes: user, token, authReady, isAuthenticated,
//          loginWithDiscord, login, register, logout,
//          handleDiscordCallback
//
// Trust Model:
//   Frontend trusts: Aura JWT ONLY (not Discord token)
//   Discord tokens: never visible to frontend
// ======================================================

// ── Pure JWT helpers ──────────────────────────────────
const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

const applyTokenToAxios = (token) => {
  if (token) {
    apiService.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete apiService.defaults.headers.common['Authorization'];
  }
};

// ── Safe localStorage helpers ─────────────────────────
const readStorage = () => {
  try {
    const token = localStorage.getItem('aura_token');
    const user = JSON.parse(localStorage.getItem('aura_user') || 'null');
    return { token, user };
  } catch {
    return { token: null, user: null };
  }
};

const writeStorage = (token, user) => {
  try {
    localStorage.setItem('aura_token', token);
    localStorage.setItem('aura_user', JSON.stringify(user));
  } catch {
    // Silently fail if localStorage is unavailable (private mode, etc.)
  }
};

const clearStorage = () => {
  try {
    localStorage.removeItem('aura_token');
    localStorage.removeItem('aura_user');
  } catch (err) {
    console.warn('[Auth] localStorage clear failed:', err?.message);
  }
};

// ── Provider ──────────────────────────────────────────
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);
  const initRef = useRef(false);

  // ── Clear auth state helper ─────────────────────────
  const clearAuth = useCallback(() => {
    setUser(null);
    setToken(null);
    setAuthError(null);
    clearStorage();
    applyTokenToAxios(null);
  }, []);

  // ── Set auth state helper ───────────────────────────
  const setAuth = useCallback((t, u) => {
    setToken(t);
    setUser(u);
    setAuthError(null);
    writeStorage(t, u);
    applyTokenToAxios(t);
  }, []);

  // ── Session restoration on mount ──────────────────────
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const { token: stored, user: storedUser } = readStorage();

    if (stored && storedUser && !isTokenExpired(stored)) {
      setToken(stored);
      setUser(storedUser);
      applyTokenToAxios(stored);
    } else if (stored && isTokenExpired(stored)) {
      clearStorage();
    }

    setAuthReady(true);

    // 401 cascade: any API 401 triggers logout
    const handle401 = () => clearAuth();
    eventBus.on('auth:unauthorized', handle401);
    return () => eventBus.off('auth:unauthorized', handle401);
  }, [clearAuth]);

  // ══════════════════════════════════════════════════════
  // DISCORD FEDERATED AUTH — Phase D1
  // ══════════════════════════════════════════════════════

  // ── Initiate Discord OAuth login ────────────────────
  // Redirects browser to Discord's authorization page
  const loginWithDiscord = useCallback(async () => {
    try {
      setAuthError(null);
      const data = await authApi.getDiscordLoginUrl();
      const url = data?.url;
      if (!url) throw new Error('Failed to get Discord login URL');

      // Store state for validation
      if (data?.state) {
        try { sessionStorage.setItem('discord_oauth_state', data.state); } catch {}
      }

      // Redirect browser to Discord
      window.location.href = url;
    } catch (err) {
      console.error('[Auth] Discord login initiation failed:', err.message);
      setAuthError(err?.message || 'Failed to initiate Discord login');
    }
  }, []);

  // ── Handle Discord OAuth callback ───────────────────
  // Called by DiscordCallbackPage after redirect from backend
  const handleDiscordCallback = useCallback((callbackToken, callbackUser, isNewUser) => {
    if (!callbackToken || !callbackUser) {
      setAuthError('Invalid callback data');
      return false;
    }

    if (isTokenExpired(callbackToken)) {
      setAuthError('Received expired token');
      return false;
    }

    setAuth(callbackToken, callbackUser);
    // Clean up any stored OAuth state
    try { sessionStorage.removeItem('discord_oauth_state'); } catch {}

    return true;
  }, [setAuth]);

  // ══════════════════════════════════════════════════════
  // LOCAL AUTH (preserved for dev/testing)
  // ══════════════════════════════════════════════════════

  const register = useCallback(async (email, password, playerName) => {
    const res = await authApi.register({ email, password, playerName });
    const { user: u, token: t } = res;
    setAuth(t, u);
    return u;
  }, [setAuth]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    const { user: u, token: t } = res;
    setAuth(t, u);
    return u;
  }, [setAuth]);

  // ── Logout ────────────────────────────────────────────
  const logout = useCallback(async () => {
    // Attempt server-side logout (revoke Discord tokens)
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('[Auth] Server logout (non-fatal):', err?.message);
    }
    clearAuth();
  }, [clearAuth]);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      authReady,
      authError,
      isAuthenticated: !!user && !!token,
      // Discord auth (primary)
      loginWithDiscord,
      handleDiscordCallback,
      // Local auth (preserved)
      login,
      register,
      logout
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
