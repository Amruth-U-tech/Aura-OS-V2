// ======================================================
// UPLOAD MIDDLEWARE
// Multer configuration for media file uploads
// Owns: file reception, MIME filtering, size limits
// Must NOT: contain storage logic or proof lifecycle
// ======================================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { UPLOAD_CONFIG } = require('./uploadConfig');

// Ensure temp directory exists
if (!fs.existsSync(UPLOAD_CONFIG.TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_CONFIG.TEMP_DIR, { recursive: true });
}

// ── Multer disk storage (temp) ────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_CONFIG.TEMP_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});

// ── MIME type filter ──────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (UPLOAD_CONFIG.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(`File type '${file.mimetype}' not allowed. Accepted: ${UPLOAD_CONFIG.ALLOWED_MIME_TYPES.join(', ')}`);
    err.statusCode = 400;
    err.codeName = 'UPLOAD_INVALID_MIME';
    cb(err, false);
  }
};

// ── Multer instance ───────────────────────────────────
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: UPLOAD_CONFIG.MAX_FILE_SIZE,
    files: 1 // Single file per request
  }
});

// ── Error handling wrapper ────────────────────────────
const handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size: ${UPLOAD_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
        errorCode: 'UPLOAD_FILE_TOO_LARGE'
      });
    }
    return res.status(400).json({
      success: false,
      message: err.message,
      errorCode: 'UPLOAD_ERROR'
    });
  }

  if (err && err.codeName === 'UPLOAD_INVALID_MIME') {
    return res.status(400).json({
      success: false,
      message: err.message,
      errorCode: 'UPLOAD_INVALID_MIME'
    });
  }

  next(err);
};

module.exports = { upload, handleUploadError };
