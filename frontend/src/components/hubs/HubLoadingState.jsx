
// ======================================================
// HUB LOADING STATE
// Full-page loading indicator for hub data fetching
// ======================================================

const HubLoadingState = () => (
  <div style={styles.container}>
    <div style={styles.spinner} />
    <p style={styles.text}>Loading hubs...</p>
  </div>
);

const styles = {
  container: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', minHeight: '40vh', gap: '1rem'
  },
  spinner: {
    width: '32px', height: '32px', borderRadius: '50%',
    border: '3px solid rgba(255,255,255,0.1)',
    borderTopColor: '#818cf8',
    animation: 'spin 0.8s linear infinite'
  },
  text: { fontSize: '0.9rem', color: 'var(--text-secondary)' }
};

export default HubLoadingState;
