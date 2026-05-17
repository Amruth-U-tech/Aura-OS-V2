
// ======================================================
// MISSION LIFECYCLE BADGE
// Renders visual status indicator for each mission state
// Owns: visual representation only
// ======================================================

const STATUS_CONFIG = {
  PENDING:   { label: 'Pending',   color: '#facc15' },
  COMPLETED: { label: 'Complete',  color: '#4ade80' },
  FAILED:    { label: 'Failed',    color: '#f87171' },
  CANCELLED: { label: 'Cancelled', color: '#94a3b8' },
  EXPIRED:   { label: 'Expired',   color: '#fb923c' }
};

const PRIORITY_CONFIG = {
  LOW:    { label: 'Low',    color: '#64748b' },
  NORMAL: { label: 'Normal', color: '#38bdf8' },
  HIGH:   { label: 'High',   color: '#fb923c' },
  ELITE:  { label: 'Elite',  color: '#c084fc' }
};

export const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || { label: status, color: '#64748b' };
  return (
    <span style={{
      background: config.color + '22',
      color: config.color,
      border: `1px solid ${config.color}44`,
      borderRadius: '6px',
      padding: '2px 10px',
      fontSize: '0.75rem',
      fontWeight: 600,
      letterSpacing: '0.05em'
    }}>
      {config.label}
    </span>
  );
};

export const PriorityBadge = ({ priority }) => {
  const config = PRIORITY_CONFIG[priority] || { label: priority, color: '#64748b' };
  return (
    <span style={{
      background: config.color + '22',
      color: config.color,
      border: `1px solid ${config.color}44`,
      borderRadius: '6px',
      padding: '2px 8px',
      fontSize: '0.7rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase'
    }}>
      {config.label}
    </span>
  );
};
