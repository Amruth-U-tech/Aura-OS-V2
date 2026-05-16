import React from 'react';
import TaskCard from './TaskCard';
import EmptyMissionState from './EmptyMissionState';

// ======================================================
// TASK LIST
// Owns: list rendering and mission action dispatch
// ======================================================

const TaskList = ({ missions, statusFilter, onComplete, onCancel, onFail }) => {
  if (!missions || missions.length === 0) {
    return <EmptyMissionState filter={statusFilter} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {missions.map(mission => (
        <TaskCard
          key={mission._id}
          mission={mission}
          onComplete={onComplete}
          onCancel={onCancel}
          onFail={onFail}
        />
      ))}
    </div>
  );
};

export default TaskList;
