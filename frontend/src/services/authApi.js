import apiService from '@services/apiService';

// ======================================================
// AUTH API
// Owns all auth-related backend communication
// No component may call auth endpoints directly
// ======================================================

const authApi = {
  register: (data) => apiService.post('/auth/register', data),
  login: (data) => apiService.post('/auth/login', data)
};

export default authApi;
