
// ======================================================
// EMPTY MISSION STATE
// Renders when no missions exist for the current filter
// ======================================================

const EmptyMissionState = ({ filter }) => (
  <div style={{
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '3rem', gap: '0.75rem', opacity: 0.6
  }}>
    <span style={{ fontSize: '2.5rem' }}>🎯</span>
    <p style={{ fontWeight: 600 }}>
      {filter && filter !== 'ALL'
        ? `No ${filter.toLowerCase()} missions`
        : 'No missions yet'}
    </p>
    <p style={{ fontSize: '0.875rem', opacity: 0.7 }}>Create your first mission to begin.</p>
  </div>
);

export default EmptyMissionState;
