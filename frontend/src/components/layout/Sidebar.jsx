import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@context/AuthContext';
import { ROUTES } from '@utils/constants';
import NotificationBell from '@components/notifications/NotificationBell';
import './Sidebar.css';

// ======================================================
// SIDEBAR — Section-based navigation
// Follows WhatsApp Desktop pattern: avatar → sections → logout
// Phase 2.2: All sections routable, placeholder pages ready
// ======================================================

const Sidebar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate(ROUTES.AUTH);
  };

  const navItem = (to, icon, label, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
    </NavLink>
  );

  return (
    <aside className="sidebar">
      {/* ── Player Identity — Phase 2.4.3: Click to open own profile */}
      <div className="sidebar-header">
        <div className="sidebar-header-profile" onClick={() => navigate(ROUTES.PROFILE)}
          style={{ cursor: 'pointer' }} title="View your profile">
          <div className="avatar">
            {user?.playerName?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="user-info">
            <span className="user-name">{user?.playerName || 'Player'}</span>
            <span className="user-level">Lvl {user?.level || 1}</span>
          </div>
        </div>
        <NotificationBell />
      </div>

      {/* ── Navigation ─────────────────────────────── */}
      <nav className="sidebar-nav">
        {/* Core */}
        <div className="nav-section">
          <span className="nav-section-label">Core</span>
          {navItem(ROUTES.DASHBOARD, '🏠', 'Dashboard', true)}
          {navItem(ROUTES.FOCUS, '🎯', 'Missions')}
          {navItem(ROUTES.CHALLENGES, '⚔️', 'Challenges')}
          {navItem(ROUTES.DISCIPLINE, '🔥', 'Discipline')}
        </div>

        {/* Social */}
        <div className="nav-section">
          <span className="nav-section-label">Social</span>
          {navItem(ROUTES.FRIENDS, '👥', 'Friends')}
          {navItem(ROUTES.HUBS, '🌐', 'Hubs')}
          {navItem(ROUTES.LEADERBOARD, '🏆', 'Leaderboard')}
        </div>

        {/* Rewards */}
        <div className="nav-section">
          <span className="nav-section-label">Rewards</span>
          {navItem(ROUTES.REWARDS, '💰', 'XP & Rewards')}
          {navItem(ROUTES.VOUCHERS, '🎫', 'Vouchers')}
        </div>

        {/* Growth */}
        <div className="nav-section">
          <span className="nav-section-label">Growth</span>
          {navItem(ROUTES.PROFILE, '👤', 'Profile')}
          {navItem(ROUTES.NOTIFICATIONS, '🔔', 'Notifications')}
        </div>
      </nav>

      {/* ── Footer ─────────────────────────────────── */}
      <div className="sidebar-footer">
        <button onClick={handleLogout} className="logout-btn">
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
