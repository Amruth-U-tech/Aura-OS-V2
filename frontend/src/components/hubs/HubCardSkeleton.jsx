import React from 'react';

// ======================================================
// HUB CARD SKELETON — Loading placeholder
// Matches the future HubCard shape for seamless transition
// ======================================================

const HubCardSkeleton = () => (
  <div style={styles.card}>
    <div style={{ ...styles.shimmer, width: '40px', height: '40px', borderRadius: '10px' }} />
    <div style={styles.content}>
      <div style={{ ...styles.shimmer, width: '60%', height: '14px' }} />
      <div style={{ ...styles.shimmer, width: '40%', height: '12px' }} />
    </div>
  </div>
);

const styles = {
  card: {
    display: 'flex', alignItems: 'center', gap: '14px',
    padding: '16px', borderRadius: '12px',
    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)'
  },
  content: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' },
  shimmer: {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '6px'
  }
};

export default HubCardSkeleton;
