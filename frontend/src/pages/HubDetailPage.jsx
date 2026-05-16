import React from 'react';

// ======================================================
// HUB DETAIL PAGE — PLACEHOLDER
// Phase 2.2: Route infrastructure only
// Phase 2.3: Hub member list, leaderboard, Discord link
// ======================================================

const HubDetailPage = () => {
  return (
    <div className="page" id="hub-detail-page">
      <div style={styles.container}>
        <div style={styles.iconWrap}>🏠</div>
        <h1 style={styles.title}>Hub Details</h1>
        <p style={styles.subtitle}>Hub member management and leaderboard</p>
        <div style={styles.badge}>Coming in Phase 2.3</div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '60vh', textAlign: 'center',
    gap: '1rem'
  },
  iconWrap: { fontSize: '3rem' },
  title: { fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '-0.5rem' },
  badge: {
    padding: '6px 16px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: 600,
    background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.25)'
  }
};

export default HubDetailPage;
