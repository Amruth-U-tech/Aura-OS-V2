import apiService from '@services/apiService';
import { API_ENDPOINTS } from '@utils/constants';

// ======================================================
// SOCIAL API — Phase 2.4.1
// Owns: friend requests, friendships
// Uses auraPlayerId for friend requests (not Mongo IDs)
// Player search is now in discoveryApi (GLOBAL scope)
// ======================================================

const socialApi = {
  getFriends: (params = {}) => apiService.get(API_ENDPOINTS.SOCIAL_FRIENDS, { params }),
  getRequests: (params = {}) => apiService.get(API_ENDPOINTS.SOCIAL_REQUESTS, { params }),
  // Send friend request by auraPlayerId (preferred) or userId
  sendRequest: (target, message = '') => {
    const payload = { message };
    if (typeof target === 'string' && target.startsWith('AURA-PLR-')) {
      payload.auraPlayerId = target;
    } else {
      payload.receiverId = target;
    }
    return apiService.post('/social/friends/request', payload);
  },
  acceptRequest: (id) => apiService.post(`/social/friends/accept/${id}`),
  declineRequest: (id) => apiService.post(`/social/friends/decline/${id}`),
  removeFriend: (userId) => apiService.delete(`/social/friends/${userId}`),
  // Phase 2.4.4: Outgoing request lifecycle
  getSentRequests: (params = {}) => apiService.get('/social/friends/requests/sent', { params }),
  markRequestRead: (id) => apiService.post(`/social/friends/requests/${id}/read`)
};

export default socialApi;
