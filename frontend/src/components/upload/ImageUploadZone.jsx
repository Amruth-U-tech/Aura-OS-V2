import React, { useState, useRef, useCallback } from 'react';
import uploadApi from '@services/uploadApi';
import './ImageUploadZone.css';

// ======================================================
// IMAGE UPLOAD ZONE — Phase 2.4.3
// Reusable drag-and-drop + click-to-browse upload component
// Supports: avatar, proof, certificate uploads
// Shows: preview, progress state, validation feedback
// Must NOT: contain business logic — only upload UX
// ======================================================

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const ImageUploadZone = ({
  purpose = 'general',
  onUploadComplete,
  currentImage = null,
  label = 'Upload Image',
  compact = false,
  accept = ACCEPTED_TYPES.join(',')
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState(currentImage);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(null); // 'validating' | 'uploading' | 'done' | 'error'
  const fileInputRef = useRef(null);

  // ── Validate file before upload ────────────────────
  const validateFile = (file) => {
    if (!file) return 'No file selected';
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return `Invalid file type. Accepted: ${ACCEPTED_TYPES.map(t => t.split('/')[1]).join(', ')}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File too large. Maximum: ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
    }
    return null;
  };

  // ── Handle file selection ──────────────────────────
  const handleFile = useCallback(async (file) => {
    setError(null);
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      setProgress('error');
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target.result);
    reader.readAsDataURL(file);

    // Upload to backend
    setUploading(true);
    setProgress('uploading');
    try {
      const result = await uploadApi.uploadImage(file, purpose);
      setProgress('done');
      if (onUploadComplete) {
        onUploadComplete(result.url, result);
      }
    } catch (err) {
      setError(err?.message || 'Upload failed');
      setProgress('error');
      setPreview(currentImage); // Revert preview on failure
    } finally {
      setUploading(false);
    }
  }, [purpose, onUploadComplete, currentImage]);

  // ── Drag handlers ──────────────────────────────────
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleClick = () => {
    if (!uploading) fileInputRef.current?.click();
  };

  // ── Progress indicator text ────────────────────────
  const getProgressText = () => {
    if (progress === 'uploading') return '⏳ Uploading...';
    if (progress === 'done') return '✅ Uploaded!';
    if (progress === 'error') return '❌ Failed';
    return null;
  };

  return (
    <div
      className={`upload-zone ${compact ? 'compact' : ''} ${isDragging ? 'dragging' : ''} ${uploading ? 'uploading' : ''} ${progress === 'done' ? 'done' : ''} ${progress === 'error' ? 'has-error' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={label}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        className="upload-input-hidden"
        disabled={uploading}
      />

      {/* Preview */}
      {preview ? (
        <div className="upload-preview">
          <img src={preview} alt="Preview" className="upload-preview-img" />
          {!uploading && (
            <div className="upload-overlay">
              <span className="upload-overlay-text">📷 Change</span>
            </div>
          )}
        </div>
      ) : (
        <div className="upload-placeholder">
          <span className="upload-icon">📤</span>
          <span className="upload-label">{label}</span>
          <span className="upload-hint">Drag & drop or click to browse</span>
          <span className="upload-formats">JPEG, PNG, WebP, GIF • Max 5MB</span>
        </div>
      )}

      {/* Progress/Status bar */}
      {progress && (
        <div className={`upload-status ${progress}`}>
          {uploading && <div className="upload-spinner" />}
          <span className="upload-status-text">{getProgressText()}</span>
        </div>
      )}

      {/* Error message */}
      {error && <div className="upload-error">{error}</div>}
    </div>
  );
};

export default ImageUploadZone;
