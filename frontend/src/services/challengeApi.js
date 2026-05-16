import apiService from '@services/apiService';
import { API_ENDPOINTS } from '@utils/constants';

// ======================================================
// CHALLENGE API — Phase 2.4.1
// Owns: challenge CRUD, join, submit, resolve
// Supports: FRIEND_1V1 (one-to-one) and HUB (one-to-many) routing
// ======================================================

const challengeApi = {
  getMyChallenges: (params = {}) => apiService.get(API_ENDPOINTS.CHALLENGES_MY, { params }),
  getChallenge: (id) => apiService.get(`/challenges/${id}`),
  createChallenge: (data) => {
    const payload = {
      title: data.title,
      description: data.description,
      type: data.type,
      stakeXp: data.stakeXp,
      stakeType: data.stakeType || 'XP',
      endAt: data.endAt, // Phase 2.4.2: mandatory
      startAt: data.startAt || null,
      submissionDeadline: data.submissionDeadline || null
    };
    // Friend 1v1: route to specific friend
    if (data.type === 'FRIEND_1V1' && data.targetFriendId) {
      // If it looks like an AURA-PLR-ID, use that field
      if (data.targetFriendId.startsWith('AURA-PLR-')) {
        payload.targetAuraPlayerId = data.targetFriendId;
      } else {
        payload.targetFriendId = data.targetFriendId;
      }
    }
    // Hub challenges: route to hub
    if (['HUB_OPEN', 'HUB_TOURNAMENT'].includes(data.type) && data.hubId) {
      payload.hubId = data.hubId;
    }
    return apiService.post(API_ENDPOINTS.CHALLENGES_API, payload);
  },
  joinChallenge: (id) => apiService.post(`/challenges/${id}/join`),
  activateChallenge: (id) => apiService.post(`/challenges/${id}/activate`),
  submitProof: (id, data) => apiService.post(`/challenges/${id}/submit`, data),
  resolveChallenge: (id) => apiService.post(`/challenges/${id}/resolve`),
  cancelChallenge: (id) => apiService.post(`/challenges/${id}/cancel`),
  getSubmissions: (id, params = {}) => apiService.get(`/challenges/${id}/submissions`, { params })
};

export default challengeApi;
