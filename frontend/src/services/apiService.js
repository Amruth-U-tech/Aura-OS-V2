import axios from 'axios';
import { eventBus } from '@systems/eventBus';

// ======================================================
// API SERVICE — GLOBAL COMMUNICATION GATEKEEPER
// Owns: all HTTP communication with the backend
// Injects: Authorization header from localStorage token
// Handles: 401 cascade, rate limits, network failures
// Must NOT: manage UI redirects or auth state directly
// ======================================================

const API_VERSION = 'v1';
const baseURL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/${API_VERSION}`;

const apiService = axios.create({
  baseURL,
  timeout: 10000,
  withCredentials: true,  // Phase D1.DEBUG: Send cookies for OAuth state validation
  headers: {
    'Content-Type': 'application/json'
  }
});

// ── REQUEST INTERCEPTOR ────────────────────────────────
// Injects JWT from localStorage on every outgoing request
// Owned here — NOT duplicated in components or context
apiService.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem('aura_token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // localStorage unavailable — proceed unauthenticated
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE INTERCEPTOR ──────────────────────────────
// Normalizes success payloads and handles all error states
apiService.interceptors.response.use(
  (response) => {
    eventBus.emit('backend:status', { status: 'online' });
    // Unwrap standardized { success, data, meta, timestamp } envelope
    return response.data?.data !== undefined ? response.data.data : response.data;
  },
  async (error) => {
    if (!error.response) {
      // Network error: backend offline, cold start, DNS failure
      eventBus.emit('backend:status', { status: 'offline', message: 'Backend unreachable' });
      return Promise.reject({ success: false, message: 'Network Error: Backend unreachable', type: 'network' });
    }

    const { status, data } = error.response;
    const errorMessage = data?.message || 'An unexpected error occurred';

    switch (status) {
      case 401:
        // Token expired, missing, or invalid
        // Emit event so AuthContext can cascade logout
        eventBus.emit('auth:unauthorized', { message: errorMessage });
        break;
      case 429:
        eventBus.emit('backend:rate_limited', { message: errorMessage });
        break;
      case 500:
      case 502:
      case 503:
      case 504:
        eventBus.emit('backend:error', { status, message: errorMessage });
        break;
      default:
        break;
    }

    return Promise.reject({
      success: false,
      message: errorMessage,
      errorCode: data?.errorCode,
      status,
      data
    });
  }
);

export default apiService;
