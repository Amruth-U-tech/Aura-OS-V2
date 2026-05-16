const RewardTransaction = require('../../models/RewardTransaction');

// ======================================================
// REWARD & XP TRANSACTION DOMAIN SERVICE
// Owns: immutable transaction ledger CRUD & retrieval
// CRITICAL: append-only — NO mutation after creation
// Must NOT: contain balance calculations or reward logic
// ======================================================

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

// ── Record Transaction (immutable append) ────────────
const recordTransaction = async (userId, txData) => {
  // Validate required fields
  if (!txData.type) throw Object.assign(new Error('Transaction type required'), { statusCode: 400 });
  if (txData.amount === undefined) throw Object.assign(new Error('Amount required'), { statusCode: 400 });
  if (txData.balanceBefore === undefined) throw Object.assign(new Error('Balance before required'), { statusCode: 400 });
  if (txData.balanceAfter === undefined) throw Object.assign(new Error('Balance after required'), { statusCode: 400 });

  return RewardTransaction.create({
    userId,
    type: txData.type,
    amount: txData.amount,
    balanceBefore: txData.balanceBefore,
    balanceAfter: txData.balanceAfter,
    referenceId: txData.referenceId || null,
    referenceType: txData.referenceType || null,
    status: txData.status || 'COMPLETED',
    description: txData.description || '',
    rewardDetails: txData.rewardDetails || {},
    metadata: txData.metadata || {},
    finalized: true
  });
};

// ── Get User Transaction History (paginated) ─────────
const getUserTransactions = async (userId, options = {}) => {
  const { page = 1, limit = DEFAULT_PAGE_SIZE, type = null } = options;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const skip = (Math.max(1, page) - 1) * safeLimit;

  const filter = { userId };
  if (type) filter.type = type;

  const [transactions, total] = await Promise.all([
    RewardTransaction.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    RewardTransaction.countDocuments(filter)
  ]);

  return {
    transactions: transactions.map(sanitizeTransaction),
    pagination: { page, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) }
  };
};

// ── Get transactions by reference ────────────────────
const getByReference = async (referenceId, referenceType) => {
  return RewardTransaction.find({ referenceId, referenceType })
    .sort({ createdAt: -1 })
    .lean()
    .then(txs => txs.map(sanitizeTransaction));
};

// ── User summary (aggregate) ─────────────────────────
const getUserSummary = async (userId) => {
  const result = await RewardTransaction.aggregate([
    { $match: { userId: require('mongoose').Types.ObjectId.createFromHexString(userId.toString()), status: 'COMPLETED' } },
    {
      $group: {
        _id: null,
        totalEarned: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
        totalSpent: { $sum: { $cond: [{ $lt: ['$amount', 0] }, { $abs: '$amount' }, 0] } },
        transactionCount: { $sum: 1 }
      }
    }
  ]);

  return result[0] || { totalEarned: 0, totalSpent: 0, transactionCount: 0 };
};

// ── Response Sanitization ────────────────────────────
const sanitizeTransaction = (tx) => {
  if (!tx) return null;
  const obj = tx.toObject ? tx.toObject() : tx;
  return {
    id: obj._id?.toString(),
    userId: obj.userId?.toString(),
    type: obj.type,
    amount: obj.amount,
    balanceBefore: obj.balanceBefore,
    balanceAfter: obj.balanceAfter,
    referenceId: obj.referenceId?.toString() || null,
    referenceType: obj.referenceType,
    status: obj.status,
    description: obj.description,
    rewardDetails: obj.rewardDetails || null,
    createdAt: obj.createdAt
  };
};

module.exports = {
  recordTransaction, getUserTransactions,
  getByReference, getUserSummary, sanitizeTransaction
};
