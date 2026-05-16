const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// ======================================================
// AUTH ROUTES
// Public endpoints — no protection middleware
// ======================================================

router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;
