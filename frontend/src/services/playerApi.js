import apiService from '@services/apiService';
import { API_ENDPOINTS } from '@utils/constants';

// ======================================================
// PLAYER API — Phase 2.4.2
// Owns: player profile (public/private), skills, certificates,
//       endorsements, leaderboard, XP transactions, level progress
// ======================================================

const playerApi = {
  // ── Profile ────────────────────────────────────────
  getMe: () => apiService.get(API_ENDPOINTS.PLAYER_ME),
  getPublicProfile: (auraPlayerId) => apiService.get(`${API_ENDPOINTS.PLAYER_PROFILE_BY_ID}/${auraPlayerId}`),
  updateProfile: (data) => apiService.put(API_ENDPOINTS.PLAYER_PROFILE_UPDATE, data),
  getPlayer: (userId) => apiService.get(`/player/${userId}`),

  // ── Skills & Certificates ─────────────────────────
  addSkill: (data) => apiService.post(API_ENDPOINTS.PLAYER_SKILLS, data),
  removeSkill: (index) => apiService.delete(`${API_ENDPOINTS.PLAYER_SKILLS}/${index}`),
  endorseSkill: (targetUserId, skillIndex) =>
    apiService.post(`${API_ENDPOINTS.PLAYER_SKILLS}/${skillIndex}/endorse`, { targetUserId }),
  uploadCertificate: (skillIndex, certificateUrl) =>
    apiService.put(`${API_ENDPOINTS.PLAYER_SKILLS}/${skillIndex}/certificate`, { certificateUrl }),

  // ── Progression ───────────────────────────────────
  getLevelProgress: () => apiService.get(API_ENDPOINTS.PLAYER_LEVEL_PROGRESS),
  getLeaderboard: (params = {}) => apiService.get(API_ENDPOINTS.PLAYER_LEADERBOARD, { params }),
  getTransactions: (params = {}) => apiService.get(API_ENDPOINTS.PLAYER_TRANSACTIONS, { params }),
  getSummary: () => apiService.get(API_ENDPOINTS.PLAYER_SUMMARY),

  // ── Phase 2.4.5: History ──────────────────────────
  // type: 'tasks' or 'challenges'
  getHistory: (type) => apiService.get(`/player/history/${type}`),

  // ── Vouchers ──────────────────────────────────────
  getCurrentVouchers: () => apiService.get(API_ENDPOINTS.VOUCHERS_CURRENT),
  claimVoucher: (id) => apiService.post(`/vouchers/${id}/claim`),
  getVoucherHistory: (params = {}) => apiService.get(API_ENDPOINTS.VOUCHERS_HISTORY, { params })
};

export default playerApi;
