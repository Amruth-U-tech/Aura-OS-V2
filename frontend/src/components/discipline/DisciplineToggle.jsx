import React from 'react';
import { useDisciplineState } from '@hooks/useDisciplineState';

// ======================================================
// DISCIPLINE TOGGLE
// Visual toggle rendering only
// Must NOT: determine reset truth — delegates to hook
// ======================================================

const DisciplineToggle = () => {
  const { disciplineState, loading, toggle } = useDisciplineState();

  const isActive = disciplineState?.currentState === 'ACTIVE';

  return (
    <div className="discipline-toggle">
      <span>Discipline: {disciplineState?.currentState || '—'}</span>
      <button
        disabled={loading}
        onClick={() => toggle(!isActive)}
      >
        {isActive ? 'Disable' : 'Enable'}
      </button>
    </div>
  );
};

export default DisciplineToggle;
