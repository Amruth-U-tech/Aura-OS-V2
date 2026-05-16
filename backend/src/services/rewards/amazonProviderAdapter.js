// ======================================================
// AMAZON PROVIDER ADAPTER
// Owns: Amazon PA-API communication wrapper
// Currently: returns mock data (no Associate account yet)
// Future: wraps paapi5-nodejs-sdk
// Must NOT: contain redemption logic or persistence
// ======================================================

const { REWARD_CONFIG } = require('./rewardProviderConfig');

// ── Mock voucher data ─────────────────────────────────
const MOCK_VOUCHERS = [
  {
    asin: 'B0MOCK001',
    title: 'Noise-Cancelling Wireless Headphones',
    price: 2499,
    currency: 'INR',
    dealType: 'LIGHTNING_DEAL',
    category: 'productivity',
    imageUrl: 'https://placehold.co/300x300/1e293b/818cf8?text=Headphones',
    affiliateUrl: '#mock',
    rating: 4.3,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
  {
    asin: 'B0MOCK002',
    title: 'Ergonomic Desk Lamp with USB Charging',
    price: 1899,
    currency: 'INR',
    dealType: 'COUPON',
    category: 'study_gear',
    imageUrl: 'https://placehold.co/300x300/1e293b/6366f1?text=Desk+Lamp',
    affiliateUrl: '#mock',
    rating: 4.5,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000)
  },
  {
    asin: 'B0MOCK003',
    title: 'Fitness Tracker Band — Heart Rate + Sleep',
    price: 3299,
    currency: 'INR',
    dealType: 'SALE',
    category: 'health',
    imageUrl: 'https://placehold.co/300x300/1e293b/4ade80?text=Fitness+Band',
    affiliateUrl: '#mock',
    rating: 4.1,
    expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
  },
  {
    asin: 'B0MOCK004',
    title: 'Mechanical Keyboard — Cherry MX Blue',
    price: 4599,
    currency: 'INR',
    dealType: 'LIGHTNING_DEAL',
    category: 'productivity',
    imageUrl: 'https://placehold.co/300x300/1e293b/f59e0b?text=Keyboard',
    affiliateUrl: '#mock',
    rating: 4.7,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000)
  }
];

/**
 * Fetches vouchers from Amazon PA-API.
 * Currently returns mock data — will switch to live API when approved.
 * @param {object} options - { category, maxResults }
 */
const fetchAmazonVouchers = async (options = {}) => {
  const { category, maxResults = 10 } = options;

  if (REWARD_CONFIG.MOCK_MODE) {
    let results = [...MOCK_VOUCHERS];
    if (category) {
      results = results.filter(v => v.category === category);
    }
    return {
      success: true,
      mode: 'mock',
      vouchers: results.slice(0, maxResults),
      total: results.length
    };
  }

  // Live PA-API integration (future)
  return {
    success: false,
    error: 'Live Amazon PA-API not yet implemented',
    code: 'REWARD_NOT_IMPLEMENTED'
  };
};

module.exports = { fetchAmazonVouchers };
