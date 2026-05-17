import { createContext, useState, useContext, useCallback, useEffect } from 'react';
import authApi from '@services/authApi';
import apiService from '@services/apiService';
import { eventBus } from '@systems/eventBus';

const AuthContext = createContext();

// ======================================================
// AUTH CONTEXT
// Owns: frontend authentication state + session restoration
// Exposes: user, token, authReady, login, register, logout
// Must NOT: fetch tasks, manage routing, contain business logic
// ======================================================

// ── Pure JWT helpers (no external deps) ───────────────
const isTokenExpired = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // Treat malformed token as expired
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
  const [authReady, setAuthReady] = useState(false); // Blocks rendering until session restored

  // ── Session restoration on mount ──────────────────
  // Runs exactly once on mount: reads localStorage, restores token+user,
  // then marks authReady=true so all providers and routes can proceed.
  useEffect(() => {
    const { token: stored, user: storedUser } = readStorage();

    // Session initialization: synchronize auth state from localStorage
     
    if (stored && storedUser && !isTokenExpired(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setToken(stored);
       
      setUser(storedUser);
      applyTokenToAxios(stored);
    } else if (stored && isTokenExpired(stored)) {
      clearStorage();
    }

     
    setAuthReady(true);

    // ── 401 cascade: any API 401 triggers logout ───
    const handle401 = () => {
      setUser(null);
      setToken(null);
      clearStorage();
      applyTokenToAxios(null);
    };
    eventBus.on('auth:unauthorized', handle401);
    return () => eventBus.off('auth:unauthorized', handle401);
  }, []);

  // ── Register ──────────────────────────────────────
  const register = useCallback(async (email, password, playerName) => {
    const res = await authApi.register({ email, password, playerName });
    const { user: u, token: t } = res;
    setUser(u);
    setToken(t);
    writeStorage(t, u);
    applyTokenToAxios(t);
    return u;
  }, []);

  // ── Login ─────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password });
    const { user: u, token: t } = res;
    setUser(u);
    setToken(t);
    writeStorage(t, u);
    applyTokenToAxios(t);
    return u;
  }, []);

  // ── Logout ────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    clearStorage();
    applyTokenToAxios(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      token,
      authReady,
      isAuthenticated: !!user && !!token,
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
