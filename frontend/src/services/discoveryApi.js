import apiService from '@services/apiService';
import { API_ENDPOINTS } from '@utils/constants';

// ======================================================
// DISCOVERY API — Phase 2.4.1
// GLOBAL scope: queries entire database
// Owns: player discovery, hub discovery
// ======================================================

const discoveryApi = {
  // ── Players ────────────────────────────────────────
  getRandomPlayers: (limit = 15) =>
    apiService.get(API_ENDPOINTS.DISCOVER_PLAYERS, { params: { limit } }),
  searchPlayers: (q) =>
    apiService.get(API_ENDPOINTS.DISCOVER_PLAYERS_SEARCH, { params: { q } }),

  // ── Hubs ───────────────────────────────────────────
  getRandomHubs: (limit = 15) =>
    apiService.get(API_ENDPOINTS.DISCOVER_HUBS, { params: { limit } }),
  searchHubs: (q) =>
    apiService.get(API_ENDPOINTS.DISCOVER_HUBS_SEARCH, { params: { q } })
};

export default discoveryApi;
