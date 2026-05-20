// ======================================================
// UPLOAD HEALTH SERVICE
// Owns: upload pipeline health validation
// Checks: temp dir writable, provider reachable
// Must NOT: contain proof logic or challenge logic
// ======================================================

const fs = require('fs');
const path = require('path');
const { UPLOAD_CONFIG, validateUploadEnv } = require('./uploadConfig');

/**
 * Validates upload pipeline is functional.
 */
const checkUploadHealth = async () => {
  const envResult = validateUploadEnv();

  // Check temp directory is writable
  let tempDirWritable = false;
  try {
    if (!fs.existsSync(UPLOAD_CONFIG.TEMP_DIR)) {
      fs.mkdirSync(UPLOAD_CONFIG.TEMP_DIR, { recursive: true });
    }
    const testFile = path.join(UPLOAD_CONFIG.TEMP_DIR, '.health_check');
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    tempDirWritable = true;
  } catch {
    tempDirWritable = false;
  }

  return {
    provider: 'uploads',
    status: tempDirWritable ? 'ready' : 'error',
    storageProvider: envResult.provider,
    tempDirWritable,
    maxFileSize: `${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
    allowedTypes: UPLOAD_CONFIG.ALLOWED_MIME_TYPES,
    cloudinaryConfigured: envResult.valid,
    timestamp: new Date().toISOString()
  };
};

module.exports = { checkUploadHealth };
