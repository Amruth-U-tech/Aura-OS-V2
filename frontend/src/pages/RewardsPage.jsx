import { useState, useEffect, useCallback } from 'react';
import playerApi from '@services/playerApi';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { useAuth } from '@context/AuthContext';
import './RewardsPage.css';

// ======================================================
// REWARDS PAGE — Phase 3.1.3 (Orchestrated)
// Displays: XP summary + transaction history
//
// Phase 3.1.3:
//   - All fetches routed through fetchOrchestrator
//   - Paginated transactions use page-specific cache keys
//   - Summary uses separate cooldown from transactions
// ======================================================

const TX_ICONS = {
  XP_EARNED_MISSION: '🎯', XP_EARNED_CHALLENGE: '⚔️', XP_EARNED_STREAK: '🔥',
  XP_PENALTY_FAILURE: '💀', XP_BONUS: '🌟'
};

const RewardsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { authReady } = useAuth();

  const loadData = useCallback(async () => {
    if (!authReady) return;
    setLoading(true);
    try {
      // Orchestrated: page-specific cache key prevents stale page data
      const [txData, sumData] = await Promise.all([
        fetchOrchestrator.fetch(
          `rewards.transactions.p${page}`,
          () => playerApi.getTransactions({ page, limit: 15 }),
          { cooldownMs: 5000 }
        ),
        fetchOrchestrator.fetch(
          'rewards.summary',
          () => playerApi.getSummary(),
          { cooldownMs: 10000 }
        ),
      ]);
      if (txData) {
        setTransactions(txData?.transactions || []);
        setTotalPages(txData?.pagination?.totalPages || 1);
      }
      if (sumData) setSummary(sumData);
    } catch (err) {
      if (err?.type !== 'rate_limited') {
        console.warn('[Rewards] Failed to load:', err?.message);
      }
    }
    setLoading(false);
  }, [page, authReady]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  return (
    <div className="rewards-page">
      <h1 className="page-title">💰 Rewards & XP</h1>

      {/* ── Summary Cards ─────────────────────────── */}
      {summary && (
        <div className="summary-grid">
          <div className="summary-card earned">
            <span className="summary-value">{summary.totalEarned || 0}</span>
            <span className="summary-label">Total Earned</span>
          </div>
          <div className="summary-card spent">
            <span className="summary-value">{summary.totalSpent || 0}</span>
            <span className="summary-label">Total Spent</span>
          </div>
          <div className="summary-card count">
            <span className="summary-value">{summary.transactionCount || 0}</span>
            <span className="summary-label">Transactions</span>
          </div>
        </div>
      )}

      {/* ── Transaction History ────────────────────── */}
      <h2 className="section-title">Transaction History</h2>
      <div className="tx-list">
        {loading ? <p className="empty-text">Loading...</p> :
          transactions.length === 0 ? <p className="empty-text">No transactions yet</p> :
            (Array.isArray(transactions) ? transactions : []).map((tx, i) => (
              <div key={tx.id || i} className={`tx-row ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                <span className="tx-icon">{TX_ICONS[tx.type] || '💫'}</span>
                <div className="tx-info">
                  <span className="tx-desc">{tx.description || tx.type}</span>
                  <span className="tx-time">{new Date(tx.createdAt).toLocaleString()}</span>
                </div>
                <span className={`tx-amount ${tx.amount >= 0 ? 'positive' : 'negative'}`}>
                  {tx.amount >= 0 ? '+' : ''}{tx.amount} XP
                </span>
              </div>
            ))
        }
      </div>

      {totalPages > 1 && (
        <div className="lb-pagination">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="lb-page-btn">← Prev</button>
          <span className="lb-page-info">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="lb-page-btn">Next →</button>
        </div>
      )}
    </div>
  );
};

export default RewardsPage;
