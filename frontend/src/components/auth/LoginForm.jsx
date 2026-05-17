import { useState } from 'react';
import { useAuth } from '@context/AuthContext';

// ======================================================
// LOGIN FORM
// Owns: login form rendering and submission
// Delegates: auth state mutation to AuthContext.login()
// Must NOT: touch localStorage, tokens, or routing
// ======================================================

const LoginForm = ({ onSwitch }) => {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(form.email, form.password);
      // Navigation is handled by ProtectedRoute/routes.jsx
    } catch (err) {
      setError(err.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <h2 style={styles.heading}>Welcome Back</h2>
      <p style={styles.sub}>Sign in to your Aura account</p>

      <input
        id="login-email"
        name="email"
        type="email"
        placeholder="Email address"
        value={form.email}
        onChange={handleChange}
        required
        style={styles.input}
      />
      <input
        id="login-password"
        name="password"
        type="password"
        placeholder="Password"
        value={form.password}
        onChange={handleChange}
        required
        style={styles.input}
      />

      {error && <p style={styles.error}>{error}</p>}

      <button type="submit" disabled={loading} style={styles.btn}>
        {loading ? 'Signing in...' : 'Sign In'}
      </button>

      <p style={styles.switchText}>
        No account?{' '}
        <button type="button" onClick={onSwitch} style={styles.switchBtn}>
          Create one
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

export default LoginForm;
