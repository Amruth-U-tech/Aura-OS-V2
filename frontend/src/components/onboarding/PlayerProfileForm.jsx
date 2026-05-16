import React, { useState } from 'react';

// ======================================================
// PLAYER PROFILE FORM
// Collects physical profile and goal data during onboarding
// ======================================================

const PlayerProfileForm = ({ onNext, onBack, updateData }) => {
  const [form, setForm] = useState({
    playerName: '', age: '', height: '', weight: '', primaryGoal: ''
  });

  const handleChange = (e) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateData(form);
    onNext();
  };

  return (
    <form className="profile-form" onSubmit={handleSubmit}>
      <h2>Your Profile</h2>
      <input name="playerName" placeholder="Player Name" value={form.playerName} onChange={handleChange} required />
      <input name="age" type="number" placeholder="Age" value={form.age} onChange={handleChange} />
      <input name="height" type="number" placeholder="Height (cm)" value={form.height} onChange={handleChange} />
      <input name="weight" type="number" placeholder="Weight (kg)" value={form.weight} onChange={handleChange} />
      <select name="primaryGoal" value={form.primaryGoal} onChange={handleChange}>
        <option value="">Select Primary Goal</option>
        <option value="FITNESS">Fitness</option>
        <option value="PRODUCTIVITY">Productivity</option>
        <option value="DISCIPLINE">Discipline</option>
        <option value="LEARNING">Learning</option>
        <option value="WEIGHT_LOSS">Weight Loss</option>
        <option value="MUSCLE_GAIN">Muscle Gain</option>
      </select>
      <div className="form-actions">
        <button type="button" onClick={onBack}>Back</button>
        <button type="submit">Continue</button>
      </div>
    </form>
  );
};

export default PlayerProfileForm;
