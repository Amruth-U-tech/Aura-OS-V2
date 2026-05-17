
// ======================================================
// EMPTY HUB STATE
// Shown when user has no hubs — encourages joining
// ======================================================

const EmptyHubState = ({ onJoinClick }) => (
  <div style={styles.container}>
    <div style={styles.icon}>🌐</div>
    <h2 style={styles.title}>No Hubs Yet</h2>
    <p style={styles.description}>
      Join a hub to compete with friends and track each other's behavioral progress.
    </p>
    <button style={styles.joinBtn} onClick={onJoinClick}>
      Join a Hub
    </button>
  </div>
);

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '40vh', textAlign: 'center', gap: '0.75rem'
  },
  icon: { fontSize: '3rem', opacity: 0.6 },
  title: { fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' },
  description: {
    fontSize: '0.9rem', color: 'var(--text-secondary)', maxWidth: '360px', lineHeight: 1.6
  },
  joinBtn: {
    marginTop: '0.5rem', padding: '10px 24px', borderRadius: '10px',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem',
    transition: 'opacity 0.2s'
  }
};

export default EmptyHubState;
