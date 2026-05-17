import { useAuth } from '@context/AuthContext';

// ======================================================
// PLAYER PROFILE DROPDOWN
// Renders player identity and logout action
// ======================================================

const PlayerProfileDropdown = () => {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <div className="profile-dropdown">
      <span className="player-name">{user.playerName}</span>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

export default PlayerProfileDropdown;
