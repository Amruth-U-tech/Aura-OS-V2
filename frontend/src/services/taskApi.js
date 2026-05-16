import apiService from '@services/apiService';

// ======================================================
// TASK API
// Owns ALL mission-related backend communication
// No component may call task endpoints directly
// ======================================================

const taskApi = {
  // Queries
  getAll: (params = {}) => apiService.get('/tasks', { params }),
  getById: (id) => apiService.get(`/tasks/${id}`),

  // Creation
  create: (data) => apiService.post('/tasks', data),

  // Lifecycle transitions — explicit named endpoints
  complete: (id) => apiService.patch(`/tasks/${id}/complete`),
  cancel: (id) => apiService.patch(`/tasks/${id}/cancel`),
  fail: (id) => apiService.patch(`/tasks/${id}/fail`)
};

export default taskApi;
