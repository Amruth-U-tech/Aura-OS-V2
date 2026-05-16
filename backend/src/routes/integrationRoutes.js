const express = require('express');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { checkDiscordHealth } = require('../services/discord/discordHealthService');
const { checkGemmaHealth } = require('../services/gemma/gemmaHealthService');
const { checkUploadHealth } = require('../services/uploads/uploadHealthService');
const { checkTrustHealth } = require('../services/trust/trustHealthService');
const { checkRewardHealth } = require('../services/rewards/rewardProviderHealthService');
const { upload, handleUploadError } = require('../services/uploads/uploadMiddleware');
const { validateUploadedFile } = require('../services/uploads/uploadValidationService');
const uploadStorageService = require('../services/uploads/uploadStorageService');
const { sendWebhookTest } = require('../services/discord/discordWebhookService');
const { fetchRewards } = require('../services/rewards/rewardProviderClient');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// ======================================================
// INTEGRATION ROUTES
// Health checks and infrastructure testing endpoints
// All providers exposed under /api/v1/integrations
// Must NOT: contain business logic or lifecycle ops
// ======================================================

// ── Aggregate Health ──────────────────────────────────
router.get('/health', async (req, res) => {
  try {
    const [discord, gemma, uploads, trust, rewards] = await Promise.allSettled([
      checkDiscordHealth(),
      checkGemmaHealth(),
      checkUploadHealth(),
      Promise.resolve(checkTrustHealth()),
      checkRewardHealth()
    ]);

    const results = {
      discord: discord.status === 'fulfilled' ? discord.value : { status: 'error', error: discord.reason?.message },
      gemma: gemma.status === 'fulfilled' ? gemma.value : { status: 'error', error: gemma.reason?.message },
      uploads: uploads.status === 'fulfilled' ? uploads.value : { status: 'error', error: uploads.reason?.message },
      trust: trust.status === 'fulfilled' ? trust.value : { status: 'error', error: trust.reason?.message },
      rewards: rewards.status === 'fulfilled' ? rewards.value : { status: 'error', error: rewards.reason?.message }
    };

    // Overall status: healthy if no provider has 'error' status
    const allStatuses = Object.values(results).map(r => r.status);
    const overallStatus = allStatuses.includes('error') ? 'degraded' : 'healthy';

    sendSuccess(res, {
      overall: overallStatus,
      providers: results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    sendError(res, 'Integration health check failed', 500);
  }
});

// ── Individual Provider Health ─────────────────────────
router.get('/discord/health', async (req, res) => {
  try {
    const result = await checkDiscordHealth();
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, `Discord health check failed: ${err.message}`, 500);
  }
});

router.get('/gemma/health', async (req, res) => {
  try {
    const result = await checkGemmaHealth();
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, `Gemma health check failed: ${err.message}`, 500);
  }
});

router.get('/uploads/health', async (req, res) => {
  try {
    const result = await checkUploadHealth();
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, `Upload health check failed: ${err.message}`, 500);
  }
});

router.get('/trust/health', (req, res) => {
  try {
    const result = checkTrustHealth();
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, `Trust health check failed: ${err.message}`, 500);
  }
});

router.get('/rewards/health', async (req, res) => {
  try {
    const result = await checkRewardHealth();
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, `Reward health check failed: ${err.message}`, 500);
  }
});

// ── Upload Test Endpoint ──────────────────────────────
router.post('/uploads/test', upload.single('file'), handleUploadError, async (req, res) => {
  try {
    const validation = validateUploadedFile(req.file);

    if (!validation.valid) {
      return sendError(res, validation.error, 400, null, validation.code);
    }

    const storeResult = await uploadStorageService.store(req.file);

    sendSuccess(res, {
      validation: validation.metadata,
      storage: storeResult,
      message: 'Upload test successful'
    });
  } catch (err) {
    sendError(res, `Upload test failed: ${err.message}`, 500);
  }
});

// ── Protected Image Upload — Phase 2.4.3 ──────────────
// Authenticated endpoint for avatar, proof, certificate uploads
// Returns the stored URL for use in profile/challenge submissions
const UPLOAD_FOLDERS = {
  avatar: 'aura-os/avatars',
  proof: 'aura-os/proofs',
  certificate: 'aura-os/certificates',
  general: 'aura-os/uploads'
};

router.post('/uploads/image', protect, upload.single('file'), handleUploadError, async (req, res) => {
  try {
    const validation = validateUploadedFile(req.file);

    if (!validation.valid) {
      return sendError(res, validation.error, 400, null, validation.code);
    }

    // Determine folder from purpose query param
    const purpose = req.body.purpose || req.query.purpose || 'general';
    const folder = UPLOAD_FOLDERS[purpose] || UPLOAD_FOLDERS.general;

    const storeResult = await uploadStorageService.store(req.file, {
      folder,
      tags: [purpose, `user-${req.user.id}`]
    });

    if (!storeResult.success) {
      return sendError(res, storeResult.error || 'Upload failed', 500, null, 'UPLOAD_STORAGE_FAILED');
    }

    sendSuccess(res, {
      url: storeResult.url,
      publicId: storeResult.publicId,
      provider: storeResult.provider,
      purpose
    }, 'Image uploaded');
  } catch (err) {
    sendError(res, `Upload failed: ${err.message}`, 500);
  }
});

// ── Webhook Test Endpoint ─────────────────────────────
router.post('/discord/webhook-test', async (req, res) => {
  try {
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return sendError(res, 'webhookUrl is required', 400, null, 'BAD_REQUEST');
    }

    const result = await sendWebhookTest(webhookUrl);
    if (result.success) {
      sendSuccess(res, result);
    } else {
      sendError(res, result.error, 400, null, result.code);
    }
  } catch (err) {
    sendError(res, `Webhook test failed: ${err.message}`, 500);
  }
});

// ── Rewards Fetch (Mock) ──────────────────────────────
router.get('/rewards/vouchers', async (req, res) => {
  try {
    const { category, limit } = req.query;
    const result = await fetchRewards({
      category,
      maxResults: parseInt(limit) || 10
    });
    sendSuccess(res, result);
  } catch (err) {
    sendError(res, `Reward fetch failed: ${err.message}`, 500);
  }
});

// ── Hub Validation Placeholder ────────────────────────
router.get('/hubs/validate/:hubId', (req, res) => {
  const { hubId } = req.params;

  // Validate hub ID format: AURA-HUB-XXXXXXXX
  const hubIdPattern = /^AURA-HUB-[A-Z0-9]{8}$/;

  if (!hubIdPattern.test(hubId)) {
    return sendError(res, 'Invalid hub ID format. Expected: AURA-HUB-XXXXXXXX', 400, null, 'HUB_INVALID_ID');
  }

  // Placeholder response — hub existence check will come in Phase 2.3
  sendSuccess(res, {
    hubId,
    exists: false,
    message: 'Hub validation infrastructure ready — persistence pending Phase 2.3',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
