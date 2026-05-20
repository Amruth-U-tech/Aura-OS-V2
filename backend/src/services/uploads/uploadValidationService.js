// ======================================================
// UPLOAD VALIDATION SERVICE
// Owns: validating uploaded file integrity and metadata
// Must NOT: contain storage logic or proof ownership
// ======================================================

const fs = require('fs');
const path = require('path');
const { UPLOAD_CONFIG } = require('./uploadConfig');

/**
 * Validates an uploaded file's integrity.
 * Checks: file exists, size within limit, MIME type allowed.
 * @param {object} file - Multer file object
 */
const validateUploadedFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file provided', code: 'UPLOAD_NO_FILE' };
  }

  if (!file.path || !fs.existsSync(file.path)) {
    return { valid: false, error: 'File not found on disk', code: 'UPLOAD_FILE_MISSING' };
  }

  if (file.size > UPLOAD_CONFIG.MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size ${(file.size / (1024 * 1024)).toFixed(2)}MB exceeds ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB limit`,
      code: 'UPLOAD_FILE_TOO_LARGE'
    };
  }

  if (!UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    return {
      valid: false,
      error: `MIME type ${file.mimetype} not allowed`,
      code: 'UPLOAD_INVALID_MIME'
    };
  }

  return {
    valid: true,
    metadata: {
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      tempPath: file.path,
      extension: path.extname(file.originalname).toLowerCase()
    }
  };
};

module.exports = { validateUploadedFile };
