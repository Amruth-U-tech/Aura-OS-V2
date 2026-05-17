
// ======================================================
// DISCIPLINE SETTINGS MODAL
// Phase 2: allows editing scheduled hour and duration
// ======================================================

const DisciplineSettingsModal = ({ onClose }) => (
  <div className="modal discipline-settings-modal">
    <h3>Discipline Settings</h3>
    <p>Configuration options — Phase 2 implementation.</p>
    <button onClick={onClose}>Close</button>
  </div>
);

export default DisciplineSettingsModal;
