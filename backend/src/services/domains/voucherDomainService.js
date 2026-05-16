const Voucher = require('../../models/Voucher');
const { PlayerVoucher } = require('../../models/Voucher');
const PlayerProfile = require('../../models/PlayerProfile');

// ======================================================
// VOUCHER DOMAIN SERVICE — Phase 2.4.2
// Owns: Weekly voucher pool generation, claims, lifecycle
// Players unlock vouchers based on weekly XP thresholds
// Claimed vouchers persist across weeks
// Must NOT: contain XP calculation or progression logic
// ======================================================

// ── Weekly Pool Generation ───────────────────────────
// Generates the default voucher pool for a week
const generateWeeklyPool = async () => {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);
  const weekPoolId = `WEEK-${weekStart.toISOString().slice(0, 10)}`;

  // Check if pool already exists
  const existing = await Voucher.countDocuments({ weekPoolId });
  if (existing > 0) return { poolId: weekPoolId, count: existing, alreadyExists: true };

  // Default voucher pool
  const vouchers = [
    {
      title: 'XP Boost x1.5',
      description: 'Earn 1.5x XP on your next completed mission',
      icon: '⚡',
      xpThreshold: 50,
      rewardType: 'XP_BOOST',
      rewardValue: 1.5,
      weekPoolId, weekStartDate: weekStart, weekEndDate: weekEnd
    },
    {
      title: 'Trust Shield',
      description: 'Protect your trust score from one failed validation',
      icon: '🛡️',
      xpThreshold: 150,
      rewardType: 'TRUST_BOOST',
      rewardValue: 5,
      weekPoolId, weekStartDate: weekStart, weekEndDate: weekEnd
    },
    {
      title: 'Streak Guardian',
      description: 'Protect your streak from breaking for one day',
      icon: '🔥',
      xpThreshold: 300,
      rewardType: 'BADGE',
      rewardValue: 1,
      rewardMeta: { type: 'streak_guard' },
      weekPoolId, weekStartDate: weekStart, weekEndDate: weekEnd
    },
    {
      title: 'Double XP Day',
      description: 'Earn 2x XP for 24 hours',
      icon: '💎',
      xpThreshold: 500,
      rewardType: 'XP_BOOST',
      rewardValue: 2,
      weekPoolId, weekStartDate: weekStart, weekEndDate: weekEnd
    },
    {
      title: 'Champion Badge',
      description: 'Exclusive weekly champion badge for your profile',
      icon: '👑',
      xpThreshold: 750,
      rewardType: 'COSMETIC',
      rewardValue: 1,
      rewardMeta: { badge: 'weekly_champion' },
      weekPoolId, weekStartDate: weekStart, weekEndDate: weekEnd
    }
  ];

  const created = await Voucher.insertMany(vouchers);
  return { poolId: weekPoolId, count: created.length, alreadyExists: false };
};

// ── Get Current Week's Vouchers ──────────────────────
const getCurrentVouchers = async (userId) => {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekPoolId = `WEEK-${weekStart.toISOString().slice(0, 10)}`;

  // Get all vouchers in current pool
  const vouchers = await Voucher.find({ weekPoolId, isActive: true })
    .sort({ xpThreshold: 1 })
    .lean();

  // Get user's profile for weekly XP
  const profile = await PlayerProfile.findOne({ userId }).lean();
  const weeklyXp = profile?.weeklyVoucherXp || 0;

  // Get user's claimed vouchers
  const claimed = await PlayerVoucher.find({ userId, weekPoolId }).lean();
  const claimedIds = new Set(claimed.map(c => c.voucherId.toString()));

  // Build voucher status list
  const voucherList = vouchers.map(v => ({
    id: v._id.toString(),
    title: v.title,
    description: v.description,
    icon: v.icon,
    xpThreshold: v.xpThreshold,
    rewardType: v.rewardType,
    rewardValue: v.rewardValue,
    isUnlocked: weeklyXp >= v.xpThreshold,
    isClaimed: claimedIds.has(v._id.toString()),
    status: claimedIds.has(v._id.toString()) ? 'CLAIMED' :
            weeklyXp >= v.xpThreshold ? 'UNLOCKED' : 'LOCKED'
  }));

  // Calculate next threshold
  const nextLocked = voucherList.find(v => v.status === 'LOCKED');
  const xpToNext = nextLocked ? nextLocked.xpThreshold - weeklyXp : 0;

  // Calculate week countdown
  const weekEnd = getWeekEnd(now);
  const msToRefresh = weekEnd.getTime() - now.getTime();
  const hoursToRefresh = Math.max(0, Math.floor(msToRefresh / (1000 * 60 * 60)));

  return {
    weekPoolId,
    weeklyXp,
    vouchers: voucherList,
    xpToNextVoucher: Math.max(0, xpToNext),
    hoursToRefresh,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString()
  };
};

// ── Claim a Voucher ──────────────────────────────────
const claimVoucher = async (userId, voucherId) => {
  const voucher = await Voucher.findById(voucherId);
  if (!voucher) throw Object.assign(new Error('Voucher not found'), { statusCode: 404 });
  if (!voucher.isActive) throw Object.assign(new Error('Voucher is no longer active'), { statusCode: 400 });

  // Check if already claimed
  const existing = await PlayerVoucher.findOne({ userId, voucherId });
  if (existing) throw Object.assign(new Error('Voucher already claimed'), { statusCode: 409 });

  // Check XP threshold
  const profile = await PlayerProfile.findOne({ userId });
  if (!profile) throw Object.assign(new Error('Profile not found'), { statusCode: 404 });

  const weeklyXp = profile.weeklyVoucherXp || 0;
  if (weeklyXp < voucher.xpThreshold) {
    throw Object.assign(new Error(`Need ${voucher.xpThreshold - weeklyXp} more weekly XP to claim`), { statusCode: 400 });
  }

  const claim = await PlayerVoucher.create({
    userId,
    voucherId,
    weekPoolId: voucher.weekPoolId,
    status: 'CLAIMED',
    claimedAt: new Date(),
    expiresAt: voucher.weekEndDate
  });

  return {
    claim: {
      id: claim._id.toString(),
      voucherId: claim.voucherId.toString(),
      title: voucher.title,
      icon: voucher.icon,
      rewardType: voucher.rewardType,
      rewardValue: voucher.rewardValue,
      claimedAt: claim.claimedAt
    }
  };
};

// ── Get User's Claimed Vouchers (all-time) ───────────
const getClaimedVouchers = async (userId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const safeLimit = Math.min(Math.max(1, limit), 50);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const [claims, total] = await Promise.all([
    PlayerVoucher.find({ userId })
      .sort({ claimedAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .populate('voucherId', 'title icon rewardType rewardValue')
      .lean(),
    PlayerVoucher.countDocuments({ userId })
  ]);

  return {
    claims: claims.map(c => ({
      id: c._id.toString(),
      voucherId: c.voucherId?._id?.toString(),
      title: c.voucherId?.title,
      icon: c.voucherId?.icon,
      rewardType: c.voucherId?.rewardType,
      rewardValue: c.voucherId?.rewardValue,
      weekPoolId: c.weekPoolId,
      status: c.status,
      claimedAt: c.claimedAt
    })),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Week Helpers ─────────────────────────────────────
const getWeekStart = (date) => {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as week start
  const weekStart = new Date(d.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const getWeekEnd = (date) => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
};

module.exports = {
  generateWeeklyPool,
  getCurrentVouchers,
  claimVoucher,
  getClaimedVouchers,
  getWeekStart,
  getWeekEnd
};
