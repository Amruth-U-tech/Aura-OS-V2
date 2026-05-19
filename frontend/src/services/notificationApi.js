import apiService from './apiService';

// ======================================================
// NOTIFICATION API — Phase N1
// HTTP communication layer for notification endpoints
// All methods use JWT-authenticated apiService
//
// Must NOT: contain business logic, manage state
// ======================================================

const BASE = '/notifications';

const notificationApi = {
  // ── Fetch paginated notifications ───────────────────
  getNotifications: (params = {}) => {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page);
    if (params.limit) query.set('limit', params.limit);
    if (params.category) query.set('category', params.category);
    if (params.unreadOnly) query.set('unreadOnly', 'true');
    const qs = query.toString();
    return apiService.get(`${BASE}${qs ? `?${qs}` : ''}`);
  },

  // ── Get unread count ────────────────────────────────
  getUnreadCount: () => apiService.get(`${BASE}/unread-count`),

  // ── Mark single as read ─────────────────────────────
  markRead: (id) => apiService.patch(`${BASE}/${id}/read`),

  // ── Mark all as read ────────────────────────────────
  markAllRead: () => apiService.post(`${BASE}/read-all`),

  // ── Acknowledge (dismiss) ───────────────────────────
  acknowledge: (id) => apiService.patch(`${BASE}/${id}/acknowledge`),

  // ── Delete notification ─────────────────────────────
  deleteNotification: (id) => apiService.delete(`${BASE}/${id}`),
};

export default notificationApi;
