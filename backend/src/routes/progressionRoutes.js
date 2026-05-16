const express = require('express');
const router = express.express; // wait
const routerInstance = require('express').Router();
const progressionController = require('../controllers/progressionController');

// ======================================================
// PROGRESSION ROUTES
// Handles XP, level, and streak endpoints
// ======================================================

routerInstance.get('/', progressionController.getProgression);

module.exports = routerInstance;
