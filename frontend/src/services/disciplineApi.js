import apiService from '@services/apiService';

// ======================================================
// DISCIPLINE API
// Owns all discipline-related backend communication
// ======================================================

const disciplineApi = {
  getState: () => apiService.get('/discipline/state'),
  toggle: (enabled) => apiService.patch('/discipline/toggle', { enabled }),
  complete: () => apiService.post('/discipline/complete')
};

export default disciplineApi;
