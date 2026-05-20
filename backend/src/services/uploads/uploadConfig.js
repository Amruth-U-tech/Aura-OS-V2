// ======================================================
// UPLOAD CONFIGURATION
// Environment validation and limits for media uploads
// Owns: config extraction, MIME rules, size limits
// Must NOT: contain upload logic or file handling
// ======================================================

const path = require('path');

const UPLOAD_CONFIG = {
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  TEMP_DIR: path.join(__dirname, '..', '..', '..', 'temp_uploads'),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET
};

/**
 * Validates upload provider env vars.
 * Returns { valid, missing[], provider } — graceful degradation.
 */
const validateUploadEnv = () => {
  const cloudinaryVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
  const missing = cloudinaryVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    console.warn('[UploadConfig] ⚠️ Missing Cloudinary env vars:', missing.join(', '));
    console.warn('[UploadConfig] Upload pipeline will use local temp storage only.');
    return { valid: false, missing, provider: 'local' };
  }

  console.log('[UploadConfig] ✅ Cloudinary env vars present');
  return { valid: true, missing: [], provider: 'cloudinary' };
};

module.exports = { UPLOAD_CONFIG, validateUploadEnv };
