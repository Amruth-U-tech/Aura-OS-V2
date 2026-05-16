import apiService from './apiService';

// ======================================================
// REWARD API SERVICE
// Frontend communication with reward provider endpoints
// Must NOT: contain reward logic — only API calls
// ======================================================

const rewardApi = {
  checkHealth: () => apiService.get('/integrations/rewards/health'),
  fetchVouchers: (category, limit = 10) =>
    apiService.get(`/integrations/rewards/vouchers?category=${category || ''}&limit=${limit}`)
};

export default rewardApi;
