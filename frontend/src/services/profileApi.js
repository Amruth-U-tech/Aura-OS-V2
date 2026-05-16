import apiService from '@services/apiService';

// ======================================================
// PROFILE API
// Owns all profile-related backend communication
// ======================================================

const profileApi = {
  getProfile: () => apiService.get('/profile'),
  updateProfile: (data) => apiService.put('/profile', data)
};

export default profileApi;
