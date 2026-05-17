
// ======================================================
// TASK FILTERS
// Owns: filter UI rendering — no business logic
// ======================================================

const TaskFilters = ({ statusFilter, priorityFilter, onStatusChange, onPriorityChange, STATUS_OPTIONS, PRIORITY_OPTIONS }) => (
  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
    <select
      id="mission-status-filter"
      value={statusFilter}
      onChange={e => onStatusChange(e.target.value)}
      style={filterSelect}
    >
      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
    </select>

    <select
      id="mission-priority-filter"
      value={priorityFilter}
      onChange={e => onPriorityChange(e.target.value)}
      style={filterSelect}
    >
      {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
    </select>
  </div>
);

const filterSelect = {
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: '0.875rem'
};

export default TaskFilters;
