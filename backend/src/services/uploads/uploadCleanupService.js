// ======================================================
// UPLOAD CLEANUP SERVICE
// Owns: removing orphaned/expired temp files
// Prevents disk overflow from abandoned uploads
// Must NOT: delete proof files linked to challenges
// ======================================================

const fs = require('fs');
const path = require('path');
const { UPLOAD_CONFIG } = require('./uploadConfig');

const MAX_AGE_MS = 60 * 60 * 1000; // 1 hour max for temp files

/**
 * Removes temp files older than MAX_AGE_MS.
 * Safe to run on interval — only touches temp_uploads directory.
 */
const cleanupTempFiles = () => {
  const tempDir = UPLOAD_CONFIG.TEMP_DIR;

  if (!fs.existsSync(tempDir)) {
    return { cleaned: 0, errors: 0 };
  }

  const now = Date.now();
  let cleaned = 0;
  let errors = 0;

  try {
    const files = fs.readdirSync(tempDir);

    for (const file of files) {
      const filePath = path.join(tempDir, file);

      try {
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;

        if (age > MAX_AGE_MS) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (err) {
        errors++;
        console.warn(`[UploadCleanup] Failed to process ${file}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[UploadCleanup] Failed to read temp directory:', err.message);
    return { cleaned: 0, errors: 1 };
  }

  if (cleaned > 0) {
    console.log(`[UploadCleanup] Removed ${cleaned} expired temp files`);
  }

  return { cleaned, errors };
};

module.exports = { cleanupTempFiles };
