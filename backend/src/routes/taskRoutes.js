const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { protect } = require('../middleware/authMiddleware');

// ======================================================
// TASK ROUTES
// All routes auth-protected
// Lifecycle actions are explicit endpoints — not generic PUT
// ======================================================

// ── Collection ───────────────────────────────────────
router.get('/', protect, taskController.getMissions);
router.post('/', protect, taskController.createMission);

// ── Single resource ───────────────────────────────────
router.get('/:id', protect, taskController.getMissionById);

// ── Lifecycle transitions ─────────────────────────────
router.patch('/:id/complete', protect, taskController.completeMission);
router.patch('/:id/cancel', protect, taskController.cancelMission);
router.patch('/:id/fail', protect, taskController.failMission);

module.exports = router;
