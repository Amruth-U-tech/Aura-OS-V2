const dotenv = require('dotenv');
dotenv.config();

// ======================================================
// ENVIRONMENT VALIDATION
// Fail-fast architecture for startup protection
// Ensures backend doesn't boot without required config
// ======================================================

const requiredVariables = ['PORT', 'MONGO_URI', 'JWT_SECRET'];

const validateEnv = () => {
  const missing = requiredVariables.filter(v => !process.env[v]);
  
  if (missing.length > 0) {
    console.error('========================================================');
    console.error('❌ FATAL STARTUP ERROR: MISSING ENVIRONMENT VARIABLES');
    console.error('========================================================');
    missing.forEach(v => console.error(`- ${v}`));
    console.error('========================================================');
    console.error('The server cannot start until these variables are defined.');
    console.error('Please check your .env file or environment configuration.');
    console.error('========================================================');
    process.exit(1);
  }
};

validateEnv();

module.exports = {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  NODE_ENV: process.env.NODE_ENV || 'development'
};
