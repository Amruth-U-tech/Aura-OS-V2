import { useState } from 'react';
import { useAuth } from '@context/AuthContext';

// ======================================================
// REGISTER FORM
// Owns: registration form rendering and submission
// Delegates: auth state mutation to AuthContext.register()
// Must NOT: touch localStorage, tokens, or routing
// ======================================================

const RegisterForm = ({ onSwitch }) => {
  const { register } = useAuth();
  const [form, setForm] = useState({ email: '', password: '', playerName: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [nameError, setNameError] = useState(null); // Phase 2.4.5: per-field error

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    if (e.target.name === 'playerName') setNameError(null); // Clear on edit
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setNameError(null);
    if (form.playerName.trim().length < 2) {
      setNameError('Player name must be at least 2 characters');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(form.email, form.password, form.playerName);
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Registration failed. Try again.';
      // Phase 2.4.5: Detect duplicate name error specifically
      if (msg.toLowerCase().includes('name') && msg.toLowerCase().includes('taken')) {
        setNameError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.heading}>Create Your Player</h2>
      <p style={styles.sub}>Begin your behavioral evolution</p>

      <input
        id="register-name"
        name="playerName"
        type="text"
        placeholder="Player name"
        value={form.playerName}
        onChange={handleChange}
        required
        minLength={2}
        maxLength={50}
        style={{
          ...styles.input,
          ...(nameError ? { borderColor: '#f87171', boxShadow: '0 0 0 1px rgba(248,113,113,0.3)' } : {})
        }}
      />
      {nameError && (
        <p style={{ ...styles.error, marginTop: '-0.3rem' }}>
          ⚠️ {nameError} — please choose a different name
        </p>
      )}
      <input
        id="register-email"
        name="email"
        type="email"
        placeholder="Email address"
        value={form.email}
        onChange={handleChange}
        required
        style={styles.input}
      />
      <input
        id="register-password"
        name="password"
        type="password"
        placeholder="Password (8+ characters)"
        value={form.password}
        onChange={handleChange}
        required
        style={styles.input}
      />

      {error && <p style={styles.error}>{error}</p>}

      <button type="submit" disabled={loading} style={styles.btn}>
        {loading ? 'Creating account...' : 'Create Account'}
      </button>

      <p style={styles.switchText}>
        Already have one?{' '}
        <button type="button" onClick={onSwitch} style={styles.switchBtn}>
          Sign in
        </button>
      </p>
    </form>
  );
};

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' },
  heading: { margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary, #fff)' },
  sub: { margin: 0, fontSize: '0.9rem', opacity: 0.6, color: 'var(--text-secondary, #94a3b8)' },
  input: {
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px', padding: '12px 16px', fontSize: '0.95rem',
    color: 'var(--text-primary, #fff)', outline: 'none', width: '100%'
  },
  error: { color: '#f87171', fontSize: '0.85rem', margin: 0 },
  btn: {
    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
    border: 'none', borderRadius: '10px', padding: '12px', fontWeight: 700,
    fontSize: '0.95rem', cursor: 'pointer', transition: 'opacity 200ms ease'
  },
  switchText: { textAlign: 'center', fontSize: '0.85rem', opacity: 0.6, margin: 0 },
  switchBtn: { background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', fontWeight: 600 }
};

export default RegisterForm;
