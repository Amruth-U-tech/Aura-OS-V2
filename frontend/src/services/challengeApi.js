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
      endAt: data.endAt,
      startAt: data.startAt || null,
      submissionDeadline: data.submissionDeadline || null
    };
    if (data.type === 'FRIEND_1V1' && data.targetFriendId) {
      if (data.targetFriendId.startsWith('AURA-PLR-')) {
        payload.targetAuraPlayerId = data.targetFriendId;
      } else {
        payload.targetFriendId = data.targetFriendId;
      }
    }
    if (['HUB_OPEN', 'HUB_TOURNAMENT'].includes(data.type) && data.hubId) {
      payload.hubId = data.hubId;
    }
    return apiService.post(API_ENDPOINTS.CHALLENGES_API, payload);
  },
  // Phase 3.1.7: "Activate" button calls this — dispatches invitation (DRAFT→WAITING)
  dispatchInvite: (id) => apiService.post(`/challenges/${id}/invite`),
  // Phase 3.1.7: Start hub challenge after quorum (READY→ACTIVE)
  startChallenge: (id) => apiService.post(`/challenges/${id}/start`),
  // Phase 3.1.6: Participation lifecycle
  acceptInvite: (id) => apiService.post(`/challenges/${id}/accept`),
  declineInvite: (id) => apiService.post(`/challenges/${id}/decline`),
  leaveChallenge: (id) => apiService.post(`/challenges/${id}/leave`),
  // Hub direct join
  joinChallenge: (id) => apiService.post(`/challenges/${id}/join`),
  submitProof: (id, data) => apiService.post(`/challenges/${id}/submit`, data),
  resolveChallenge: (id) => apiService.post(`/challenges/${id}/resolve`),
  cancelChallenge: (id) => apiService.post(`/challenges/${id}/cancel`),
  getSubmissions: (id, params = {}) => apiService.get(`/challenges/${id}/submissions`, { params })
};


export default challengeApi;
