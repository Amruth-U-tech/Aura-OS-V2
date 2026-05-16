// ======================================================
// REWARD PROVIDER UTILITIES
// Pure helpers for reward data formatting
// Must NOT: make API calls, contain state, or own logic
// ======================================================

/**
 * Formats a price value for display.
 * @param {number} price - Price in smallest currency unit
 * @param {string} currency - Currency code (e.g. 'INR')
 */
const formatPrice = (price, currency = 'INR') => {
  const formatters = {
    INR: (p) => `₹${p.toLocaleString('en-IN')}`,
    USD: (p) => `$${p.toFixed(2)}`,
    EUR: (p) => `€${p.toFixed(2)}`
  };

  const formatter = formatters[currency] || ((p) => `${currency} ${p}`);
  return formatter(price);
};

/**
 * Calculates time remaining for a deal.
 * @param {Date} expiresAt - Expiration timestamp
 * @returns {{ expired, hours, minutes, label }}
 */
const getTimeRemaining = (expiresAt) => {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diff = expiry - now;

  if (diff <= 0) {
    return { expired: true, hours: 0, minutes: 0, label: 'Expired' };
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return {
    expired: false,
    hours,
    minutes,
    label: hours > 0 ? `${hours}h ${minutes}m remaining` : `${minutes}m remaining`
  };
};

module.exports = { formatPrice, getTimeRemaining };
