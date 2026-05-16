import apiService from './apiService';

// ======================================================
// DISCORD API SERVICE
// Frontend communication with Discord integration endpoints
// Must NOT: contain Discord logic — only API calls
// ======================================================

const discordApi = {
  checkHealth: () => apiService.get('/integrations/discord/health'),
  testWebhook: (webhookUrl) => apiService.post('/integrations/discord/webhook-test', { webhookUrl })
};

export default discordApi;
