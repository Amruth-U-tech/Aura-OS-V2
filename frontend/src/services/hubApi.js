import apiService from '@services/apiService';
import { API_ENDPOINTS } from '@utils/constants';

// ======================================================
// HUB API — Phase 2.4
// Owns: hub CRUD, membership, events
// ======================================================

const hubApi = {
  getMyHubs: (params = {}) => apiService.get(API_ENDPOINTS.HUBS_MY, { params }),
  getHub: (id) => apiService.get(`/hubs/${id}`),
  createHub: (data) => apiService.post(API_ENDPOINTS.HUBS_API, data),
  joinHub: (id) => apiService.post(`/hubs/${id}/join`),
  leaveHub: (id) => apiService.post(`/hubs/${id}/leave`),
  getMembers: (id, params = {}) => apiService.get(`/hubs/${id}/members`, { params }),
  getEvents: (id, params = {}) => apiService.get(`/hubs/${id}/events`, { params }),
  resolveInvite: (code) => apiService.get(`/hubs/invite/${code}`),
  // Phase 2.4.2 — Membership Approval
  getPendingMembers: (id, params = {}) => apiService.get(`/hubs/${id}/pending`, { params }),
  approveMember: (hubId, userId) => apiService.post(`/hubs/${hubId}/approve/${userId}`),
  rejectMember: (hubId, userId) => apiService.post(`/hubs/${hubId}/reject/${userId}`)
};

export default hubApi;
