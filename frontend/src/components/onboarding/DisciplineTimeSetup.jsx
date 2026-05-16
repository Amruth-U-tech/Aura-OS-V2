import React, { useState } from 'react';

// ======================================================
// DISCIPLINE TIME SETUP
// Player selects their default daily discipline hour
// ======================================================

const DisciplineTimeSetup = ({ onNext, onBack, updateData }) => {
  const [hour, setHour] = useState(6);

  const handleSubmit = (e) => {
    e.preventDefault();
    updateData({ defaultDisciplineTime: hour });
    onNext();
  };

  return (
    <form className="discipline-setup" onSubmit={handleSubmit}>
      <h2>Set Your Discipline Time</h2>
      <p>Choose the hour each day your discipline session activates.</p>
      <input
        type="number" min={0} max={23}
        value={hour}
        onChange={e => setHour(Number(e.target.value))}
      />
      <div className="form-actions">
        <button type="button" onClick={onBack}>Back</button>
        <button type="submit">Confirm</button>
      </div>
    </form>
  );
};

export default DisciplineTimeSetup;
