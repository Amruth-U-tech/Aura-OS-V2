// ======================================================
// UPLOAD STORAGE SERVICE — Phase 2.4.2
// Owns: provider abstraction layer for file storage
// Active: Cloudinary (when env configured), local fallback
// Must NOT: contain proof lifecycle or challenge logic
// ======================================================

const fs = require('fs');
const path = require('path');
const { UPLOAD_CONFIG, validateUploadEnv } = require('./uploadConfig');

class UploadStorageService {
  constructor() {
    const envResult = validateUploadEnv();
    this._provider = envResult.provider;
    this._cloudinary = null;

    // Initialize Cloudinary if configured
    if (this._provider === 'cloudinary') {
      this._initCloudinary();
    }
  }

  _initCloudinary() {
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true
      });
      this._cloudinary = cloudinary;
      console.log('☁️ [UploadStorage] Cloudinary initialized');
    } catch (err) {
      console.warn('[UploadStorage] Cloudinary init failed:', err.message);
      this._provider = 'local';
    }
  }

  get provider() {
    return this._provider;
  }

  /**
   * Stores a file using the configured provider.
   * Phase 2.4.2: Active Cloudinary upload when configured
   * @param {object} file - Multer file object
   * @param {object} options - { folder, tags[] }
   * @returns {{ success, url, publicId, provider }}
   */
  async store(file, options = {}) {
    if (!file || !file.path) {
      return { success: false, error: 'No file to store', code: 'STORAGE_NO_FILE' };
    }

    if (this._provider === 'cloudinary' && this._cloudinary) {
      return this._storeCloudinary(file, options);
    }

    // Default: local temp storage
    return this._storeLocal(file);
  }

  /**
   * Local temp storage (default fallback).
   */
  async _storeLocal(file) {
    return {
      success: true,
      url: `/temp_uploads/${path.basename(file.path)}`,
      publicId: path.basename(file.path, path.extname(file.path)),
      provider: 'local',
      tempPath: file.path
    };
  }

  /**
   * Cloudinary storage — Phase 2.4.2 active implementation.
   */
  async _storeCloudinary(file, options = {}) {
    try {
      const folder = options.folder || 'aura-os/proofs';
      const tags = options.tags || ['proof', 'challenge'];

      const result = await this._cloudinary.uploader.upload(file.path, {
        folder,
        tags,
        resource_type: 'auto',
        transformation: [
          { quality: 'auto:good', fetch_format: 'auto' },
          { width: 1920, height: 1920, crop: 'limit' }
        ]
      });

      // Clean up temp file after successful upload
      try {
        fs.unlinkSync(file.path);
      } catch { /* non-fatal */ }

      return {
        success: true,
        url: result.secure_url,
        publicId: result.public_id,
        provider: 'cloudinary',
        format: result.format,
        bytes: result.bytes,
        width: result.width,
        height: result.height
      };
    } catch (err) {
      console.error('[UploadStorage] Cloudinary upload failed:', err.message);
      // Fallback to local on Cloudinary error
      return this._storeLocal(file);
    }
  }

  /**
   * Retrieves file info by public ID.
   * @param {string} publicId - The stored file identifier
   */
  async retrieve(publicId) {
    if (this._provider === 'cloudinary' && this._cloudinary) {
      try {
        const result = await this._cloudinary.api.resource(publicId);
        return {
          success: true,
          url: result.secure_url,
          provider: 'cloudinary',
          format: result.format,
          bytes: result.bytes
        };
      } catch {
        return { success: false, error: 'File not found in Cloudinary', code: 'STORAGE_NOT_FOUND' };
      }
    }

    if (this._provider === 'local') {
      const files = fs.readdirSync(UPLOAD_CONFIG.TEMP_DIR)
        .filter(f => f.startsWith(publicId));

      if (files.length === 0) {
        return { success: false, error: 'File not found', code: 'STORAGE_NOT_FOUND' };
      }

      return {
        success: true,
        url: `/temp_uploads/${files[0]}`,
        provider: 'local'
      };
    }

    return { success: false, error: 'Provider retrieval not implemented', code: 'STORAGE_NOT_IMPLEMENTED' };
  }

  /**
   * Delete a file by public ID.
   */
  async destroy(publicId) {
    if (this._provider === 'cloudinary' && this._cloudinary) {
      try {
        await this._cloudinary.uploader.destroy(publicId);
        return { success: true };
      } catch {
        return { success: false, error: 'Delete failed' };
      }
    }
    return { success: false, error: 'Delete not implemented for this provider' };
  }
}

const uploadStorageService = new UploadStorageService();
module.exports = uploadStorageService;
