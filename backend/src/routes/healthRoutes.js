const express = require('express');
const mongoose = require('mongoose');
const { sendSuccess } = require('../utils/apiResponse');
const router = express.Router();

// ======================================================
// HEALTH ROUTES
// Used for backend wake detection, Render cold starts, 
// and Docker compose health checks
// ======================================================

router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };

  sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    database: dbStatusMap[dbState] || 'unknown'
  });
});

module.exports = router;
