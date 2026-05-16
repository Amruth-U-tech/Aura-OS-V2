import apiService from './apiService';

// ======================================================
// GEMMA API SERVICE
// Frontend communication with Gemini AI integration endpoints
// Must NOT: contain AI logic — only API calls
// ======================================================

const gemmaApi = {
  checkHealth: () => apiService.get('/integrations/gemma/health')
};

export default gemmaApi;
