// Force Google DNS — bypasses ISP DNS that blocks MongoDB Atlas SRV records
require('dns').setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

require('./config/env'); // MUST BE FIRST: validates env variables

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('./middleware/requestLogger');
const { apiLimiter } = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');
const connectDB = require('./config/db');

// ── Routes ────────────────────────────────────────────
const healthRoutes = require('./routes/healthRoutes');
const taskRoutes = require('./routes/taskRoutes');
const progressionRoutes = require('./routes/progressionRoutes');
const authRoutes = require('./routes/authRoutes');
const profileRoutes = require('./routes/profileRoutes');
const disciplineRoutes = require('./routes/disciplineRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
// Phase 2.4 — Domain Lifecycle Routes
const socialRoutes = require('./routes/socialRoutes');
const hubRoutes = require('./routes/hubRoutes');
const challengeRoutes = require('./routes/challengeRoutes');
const playerRoutes = require('./routes/playerRoutes');
// Phase 2.4.1 — Global Discovery Routes
const discoveryRoutes = require('./routes/discoveryRoutes');
// Phase 2.4.2 — Voucher Routes
const voucherRoutes = require('./routes/voucherRoutes');

// ── Lifecycle Schedulers ──────────────────────────────
const { startScheduler } = require('./services/disciplineSchedulerService');
const { startNotificationScheduler } = require('./services/notificationSchedulerService');
const { startExpirationScheduler } = require('./services/taskFailureService');
// Phase 2.4.2 — Challenge Lifecycle Scheduler
const { startChallengeScheduler, processWeeklyReset } = require('./services/challengeSchedulerService');

const { PORT } = require('./config/env');

// ======================================================
// SERVER BOOTSTRAP
// Assembles middleware, routes, schedulers, and error handling
// ======================================================

const app = express();

// Connect to Database
connectDB();

// Middleware Pipeline
app.use(helmet());
app.use(cors({
  origin: '*', // Adjust for prod
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan);
app.use(apiLimiter);

// ── API v1 Routes ─────────────────────────────────────
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/progression', progressionRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/profile', profileRoutes);
app.use('/api/v1/discipline', disciplineRoutes);
app.use('/api/v1/integrations', integrationRoutes);
// Phase 2.4 — Domain Lifecycle Routes
app.use('/api/v1/social', socialRoutes);
app.use('/api/v1/hubs', hubRoutes);
app.use('/api/v1/challenges', challengeRoutes);
app.use('/api/v1/player', playerRoutes);
// Phase 2.4.1 — Global Discovery Routes
app.use('/api/v1/discover', discoveryRoutes);
// Phase 2.4.2 — Voucher Routes
app.use('/api/v1/vouchers', voucherRoutes);

// ── Lifecycle Schedulers ──────────────────────────────
startScheduler();
startNotificationScheduler();
startExpirationScheduler();
// Phase 2.4.2 — Challenge Lifecycle Scheduler
startChallengeScheduler();
processWeeklyReset();

// Fallback 404 Route
app.use((req, res, next) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
});

// Centralized Error Handling
app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`✅ Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled rejections globally to prevent silent crashes
process.on('unhandledRejection', (err) => {
  console.error(`❌ Unhandled Rejection: ${err.message}`);
});
