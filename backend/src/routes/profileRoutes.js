const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { protect } = require('../middleware/authMiddleware');

// ======================================================
// PROFILE ROUTES
// All routes protected — require valid JWT
// ======================================================

router.get('/', protect, profileController.getProfile);
router.put('/', protect, profileController.updateProfile);

module.exports = router;
