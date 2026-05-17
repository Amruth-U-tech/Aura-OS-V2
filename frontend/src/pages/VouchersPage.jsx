import { useState, useEffect, useCallback } from 'react';
import playerApi from '@services/playerApi';
import { fetchOrchestrator } from '@utils/fetchOrchestrator';
import { useAuth } from '@context/AuthContext';
import './VouchersPage.css';

// ======================================================
// VOUCHERS PAGE — Phase 3.1.3 (Orchestrated)
// Weekly rotating voucher pool with XP threshold unlocking
// Displays: current pool, claim status, countdown, history
//
// Phase 3.1.3:
//   - All fetches routed through fetchOrchestrator
//   - Prevents duplicate /vouchers calls on rapid tab switching
//   - Claim action bypasses cooldown (force: true)
// ======================================================

const VouchersPage = () => {
  const [voucherData, setVoucherData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('current');
  const [message, setMessage] = useState(null);
  const [claimLoading, setClaimLoading] = useState(null);
  const { authReady } = useAuth();

  const showMsg = (msg) => { setMessage(msg); setTimeout(() => setMessage(null), 4000); };

  const loadCurrent = useCallback(async (options = {}) => {
    setLoading(true);
    try {
      const data = await fetchOrchestrator.fetch(
        'vouchers.current',
        () => playerApi.getCurrentVouchers(),
        { cooldownMs: 5000, ...options }
      );
      if (data) setVoucherData(data);
    } catch (err) {
      if (err?.type !== 'rate_limited') {
        console.warn('[Vouchers] Failed to load current:', err?.message);
      }
    }
    setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchOrchestrator.fetch(
        'vouchers.history',
        () => playerApi.getVoucherHistory(),
        { cooldownMs: 10000 }
      );
      if (data) setHistory(data?.claims || []);
    } catch (err) {
      if (err?.type !== 'rate_limited') {
        console.warn('[Vouchers] Failed to load history:', err?.message);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authReady) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tab === 'current') void loadCurrent();
    else void loadHistory();
  }, [tab, authReady, loadCurrent, loadHistory]);

  const handleClaim = async (id) => {
    setClaimLoading(id);
    try {
      await playerApi.claimVoucher(id);
      showMsg('🎫 Voucher claimed!');
      // Force refresh after claim (bypass cooldown)
      await loadCurrent({ force: true, cooldownMs: 0 });
    } catch (err) {
      showMsg(err?.message || 'Failed to claim');
    }
    setClaimLoading(null);
  };

  return (
    <div className="vouchers-page">
      <h1 className="page-title">🎫 Weekly Vouchers</h1>
      {message && <div className="voucher-toast">{message}</div>}

      <div className="voucher-tabs">
        <button className={`tab-btn ${tab === 'current' ? 'active' : ''}`}
          onClick={() => setTab('current')}>This Week</button>
        <button className={`tab-btn ${tab === 'history' ? 'active' : ''}`}
          onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'current' && (
        <div className="voucher-current">
          {loading ? <p className="empty-text">Loading...</p> : !voucherData ? (
            <p className="empty-text">No voucher pool available</p>
          ) : (
            <>
              {/* ── Weekly XP Progress ──────────────── */}
              <div className="weekly-xp-card">
                <div className="weekly-header">
                  <span className="weekly-label">Weekly XP</span>
                  <span className="weekly-value">{voucherData.weeklyXp} XP</span>
                </div>
                <div className="weekly-bar-bg">
                  <div className="weekly-bar-fill"
                    style={{
                      width: `${Math.min(100, (voucherData.weeklyXp / (voucherData.vouchers?.slice(-1)[0]?.xpThreshold || 750)) * 100)}%`
                    }} />
                </div>
                <div className="weekly-meta">
                  {voucherData.xpToNextVoucher > 0 && (
                    <span className="xp-to-next">
                      {voucherData.xpToNextVoucher} XP to next voucher
                    </span>
                  )}
                  <span className="refresh-timer">
                    ⏰ Resets in {voucherData.hoursToRefresh}h
                  </span>
                </div>
              </div>

              {/* ── Voucher Grid ────────────────────── */}
              <div className="voucher-grid">
                {(Array.isArray(voucherData.vouchers) ? voucherData.vouchers : []).map((v) => (
                  <div key={v.id}
                    className={`voucher-card ${v.status.toLowerCase()}`}>
                    <div className="voucher-icon">{v.icon}</div>
                    <div className="voucher-info">
                      <span className="voucher-title">{v.title}</span>
                      <span className="voucher-desc">{v.description}</span>
                      <span className="voucher-threshold">
                        {v.xpThreshold} XP required
                      </span>
                    </div>
                    <div className="voucher-action">
                      {v.status === 'CLAIMED' ? (
                        <span className="voucher-status claimed">✅ Claimed</span>
                      ) : v.status === 'UNLOCKED' ? (
                        <button className="btn-claim"
                          onClick={() => handleClaim(v.id)}
                          disabled={claimLoading === v.id}>
                          {claimLoading === v.id ? '...' : '🎫 Claim'}
                        </button>
                      ) : (
                        <span className="voucher-status locked">🔒 Locked</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="voucher-history">
          {loading ? <p className="empty-text">Loading...</p> :
            history.length === 0 ? <p className="empty-text">No vouchers claimed yet</p> :
              (Array.isArray(history) ? history : []).map((h, i) => (
                <div key={i} className="history-row">
                  <span className="history-icon">{h.icon || '🎫'}</span>
                  <div className="history-info">
                    <span className="history-title">{h.title || 'Voucher'}</span>
                    <span className="history-date">
                      {h.claimedAt ? new Date(h.claimedAt).toLocaleDateString() : '—'}
                    </span>
                  </div>
                  <span className="history-status">{h.status}</span>
                </div>
              ))
          }
        </div>
      )}
    </div>
  );
};

export default VouchersPage;
