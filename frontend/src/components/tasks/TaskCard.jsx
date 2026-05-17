import { StatusBadge, PriorityBadge } from './MissionLifecycleBadge';

// ======================================================
// TASK CARD
// Owns: mission rendering ONLY
// Must NOT: mutate backend directly — callbacks from parent
// ======================================================

const TaskCard = ({ mission, onComplete, onCancel, onFail }) => {
  const isPending = mission.status === 'PENDING';
  const deadline = new Date(mission.deadline);
  const isOverdue = deadline < new Date() && isPending;

  return (
    <div style={{
      background: 'var(--bg-secondary)',
      border: `1px solid ${isOverdue ? '#f87171' : '#334155'}`,
      borderRadius: '12px',
      padding: '1rem 1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.5rem',
      transition: 'border-color 200ms ease'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>
          {mission.title}
        </h3>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <PriorityBadge priority={mission.priority} />
          <StatusBadge status={mission.status} />
        </div>
      </div>

      {/* Description */}
      {mission.description && (
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {mission.description}
        </p>
      )}

      {/* Deadline */}
      <p style={{ margin: 0, fontSize: '0.8rem', color: isOverdue ? '#f87171' : 'var(--text-secondary)' }}>
        ⏱ {deadline.toLocaleString()}
        {isOverdue && ' — OVERDUE'}
      </p>

      {/* Actions — only for PENDING missions */}
      {isPending && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
          <button
            onClick={() => onComplete(mission._id)}
            style={actionBtn('#4ade80')}
          >Complete</button>
          <button
            onClick={() => onCancel(mission._id)}
            style={actionBtn('#94a3b8')}
          >Cancel</button>
          <button
            onClick={() => onFail(mission._id)}
            style={actionBtn('#f87171')}
          >Fail</button>
        </div>
      )}
    </div>
  );
};

const actionBtn = (color) => ({
  background: color + '22',
  color: color,
  border: `1px solid ${color}44`,
  borderRadius: '8px',
  padding: '4px 14px',
  cursor: 'pointer',
  fontSize: '0.8rem',
  fontWeight: 600,
  transition: 'background 150ms ease'
});

export default TaskCard;
