
// ======================================================
// DISCIPLINE TIMER CARD
// Displays current discipline session window
// Phase 2: will animate the countdown
// ======================================================

const DisciplineTimerCard = ({ scheduledHour, durationMinutes }) => {
  const formatHour = (h) => {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  };

  return (
    <div className="discipline-timer-card">
      <p>Session starts: {scheduledHour !== undefined ? formatHour(scheduledHour) : '—'}</p>
      <p>Duration: {durationMinutes || '—'} minutes</p>
    </div>
  );
};

export default DisciplineTimerCard;
