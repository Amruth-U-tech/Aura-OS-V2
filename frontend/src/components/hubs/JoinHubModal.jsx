import { useState } from 'react';

// ======================================================
// JOIN HUB MODAL
// Phase 2.2: validates hub ID format (AURA-HUB-XXXXXXXX)
// Phase 2.3: actual join logic via backend
// ======================================================

const JoinHubModal = ({ isOpen, onClose }) => {
  const [hubId, setHubId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate format: AURA-HUB-XXXXXXXX
    const pattern = /^AURA-HUB-[A-Z0-9]{8}$/;
    if (!pattern.test(hubId.toUpperCase())) {
      setError('Invalid hub ID. Format: AURA-HUB-XXXXXXXX');
      return;
    }

    setLoading(true);
    // Phase 2.3: call backend /api/v1/integrations/hubs/validate/:hubId
    setTimeout(() => {
      setLoading(false);
      setError('Hub validation infrastructure ready — join logic pending Phase 2.3');
    }, 800);
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <h2 style={styles.title}>Join a Hub</h2>
        <p style={styles.subtitle}>Enter the hub invite code shared by your friend.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={hubId}
            onChange={e => setHubId(e.target.value.toUpperCase())}
            placeholder="AURA-HUB-XXXXXXXX"
            style={styles.input}
            maxLength={17}
          />

          {error && <p style={styles.error}>{error}</p>}

          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
            <button type="submit" style={styles.joinBtn} disabled={loading}>
              {loading ? 'Validating...' : 'Join Hub'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
  },
  modal: {
    background: 'var(--bg-secondary, #1e293b)', borderRadius: '16px',
    padding: '2rem', width: '100%', maxWidth: '400px',
    border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 25px 60px rgba(0,0,0,0.5)'
  },
  title: { fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' },
  subtitle: { fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' },
  input: {
    width: '100%', padding: '12px 16px', borderRadius: '10px', fontSize: '1rem',
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    color: 'var(--text-primary)', outline: 'none', fontFamily: 'monospace', letterSpacing: '1px',
    boxSizing: 'border-box'
  },
  error: { fontSize: '0.8rem', color: '#f87171', marginTop: '0.5rem' },
  actions: { display: 'flex', gap: '0.75rem', marginTop: '1.25rem' },
  cancelBtn: {
    flex: 1, padding: '10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)',
    background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500
  },
  joinBtn: {
    flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    cursor: 'pointer', fontWeight: 600
  }
};

export default JoinHubModal;
