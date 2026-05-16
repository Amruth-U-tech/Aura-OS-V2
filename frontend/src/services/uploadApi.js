import apiService from './apiService';

// ======================================================
// UPLOAD API SERVICE — Phase 2.4.3
// Frontend communication with upload pipeline endpoints
// Supports: avatar, proof, certificate uploads
// Must NOT: contain file handling logic — only API calls
// ======================================================

const uploadApi = {
  checkHealth: () => apiService.get('/integrations/uploads/health'),

  // ── Protected image upload ─────────────────────────
  // Uploads a file and returns { url, publicId, provider }
  // purpose: 'avatar' | 'proof' | 'certificate' | 'general'
  uploadImage: (file, purpose = 'general') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', purpose);

    return apiService.post('/integrations/uploads/image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000 // 30s timeout for uploads
    });
  },

  /**
   * Uploads a file for testing the upload pipeline.
   * @param {File} file - The file to upload
   */
  testUpload: (file) => {
    const formData = new FormData();
    formData.append('file', file);

    return apiService.post('/integrations/uploads/test', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};

export default uploadApi;
