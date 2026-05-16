import React, { useState } from 'react';

// ======================================================
// TASK FORM
// Owns: mission creation form rendering
// Delegates submission to parent via onSubmit callback
// ======================================================

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'ELITE'];

const defaultForm = {
  title: '',
  description: '',
  priority: 'NORMAL',
  deadline: ''
};

const TaskForm = ({ onSubmit, loading, error }) => {
  const [form, setForm] = useState(defaultForm);

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await onSubmit(form);
    setForm(defaultForm);
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <input
        id="mission-title"
        name="title"
        placeholder="Mission title..."
        value={form.title}
        onChange={handleChange}
        required
        style={inputStyle}
      />

      <textarea
        id="mission-description"
        name="description"
        placeholder="Description (optional)"
        value={form.description}
        onChange={handleChange}
        rows={2}
        style={{ ...inputStyle, resize: 'vertical' }}
      />

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <select
          id="mission-priority"
          name="priority"
          value={form.priority}
          onChange={handleChange}
          style={{ ...inputStyle, flex: 1 }}
        >
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>

        <input
          id="mission-deadline"
          name="deadline"
          type="datetime-local"
          value={form.deadline}
          onChange={handleChange}
          required
          style={{ ...inputStyle, flex: 2 }}
        />
      </div>

      {error && (
        <p style={{ color: '#f87171', fontSize: '0.875rem', margin: 0 }}>{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          padding: '10px',
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1,
          transition: 'opacity 200ms ease'
        }}
      >
        {loading ? 'Creating...' : '+ Create Mission'}
      </button>
    </form>
  );
};

const inputStyle = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid #334155',
  borderRadius: '10px',
  padding: '10px 14px',
  fontSize: '0.9rem',
  outline: 'none',
  width: '100%'
};

export default TaskForm;
