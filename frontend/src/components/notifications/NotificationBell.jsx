import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNotifications } from '@context/NotificationContext';
import './NotificationBell.css';

// ======================================================
// NOTIFICATION BELL — Phase N2
// Global notification indicator with PORTAL-rendered panel
//
// Phase N2 FIX: Panel renders via createPortal(document.body)
// to escape sidebar overflow clipping completely.
// Position is calculated dynamically from bell button bounds.
//
// Must NOT: manage notification state (that's NotificationContext)
// ======================================================

const CATEGORY_ICONS = {
  SOCIAL: '👥',
  CHALLENGE: '⚔️',
  HUB: '🌐',
  SYSTEM: '⚙️',
  REWARD: '🎁',
  TASK: '✅'
};

const timeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
};

const NotificationBell = () => {
  const {
    notifications,
    unreadCount,
    markRead,
    markAllRead,
    acknowledge,
    fetchNotifications
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const panelRef = useRef(null);
  const bellRef = useRef(null);

  // ── Calculate panel position from bell button ──────
  const updatePanelPosition = useCallback(() => {
    if (!bellRef.current) return;
    const rect = bellRef.current.getBoundingClientRect();
    const panelWidth = 380;
    // Position below bell, aligned to bell's left edge
    let left = rect.left;
    // Ensure panel doesn't overflow right edge of viewport
    if (left + panelWidth > window.innerWidth - 16) {
      left = window.innerWidth - panelWidth - 16;
    }
    // Ensure panel doesn't overflow left edge
    if (left < 8) left = 8;
    setPanelPos({
      top: rect.bottom + 8,
      left
    });
  }, []);

  // ── Click outside to close ─────────────────────────
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target) &&
        bellRef.current && !bellRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('resize', updatePanelPosition);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [isOpen, updatePanelPosition]);

  // ── Toggle panel ───────────────────────────────────
  const togglePanel = () => {
    if (!isOpen) {
      fetchNotifications({ force: true });
      updatePanelPosition();
    }
    setIsOpen(prev => !prev);
  };

  const handleNotificationClick = (n) => {
    if (!n.read) markRead(n._id);
  };

  const handleAcknowledge = (e, id) => {
    e.stopPropagation();
    acknowledge(id);
  };

  const activeNotifications = notifications.filter(n => !n.acknowledged);

  // ── Portal-rendered dropdown panel ─────────────────
  const panelContent = isOpen ? createPortal(
    <div
      className="notification-panel-portal"
      ref={panelRef}
      style={{ top: panelPos.top, left: panelPos.left }}
    >
      <div className="notification-panel-header">
        <h3>Notifications</h3>
        {unreadCount > 0 && (
          <button className="mark-all-read-btn" onClick={() => markAllRead()}>
            Mark all read
          </button>
        )}
      </div>

      <div className="notification-list">
        {activeNotifications.length === 0 ? (
          <div className="notification-empty">
            <span className="empty-icon">📭</span>
            <p>No notifications yet</p>
          </div>
        ) : (
          activeNotifications.slice(0, 50).map(n => (
            <div
              key={n._id}
              className={`notification-item ${!n.read ? 'unread' : ''}`}
              onClick={() => handleNotificationClick(n)}
            >
              <div className="notification-item-left">
                <span className="notification-category-icon">
                  {CATEGORY_ICONS[n.category] || '📬'}
                </span>
                {!n.read && <span className="unread-dot" />}
              </div>
              <div className="notification-item-content">
                <p className="notification-title">{n.title}</p>
                {n.message && <p className="notification-message">{n.message}</p>}
                <span className="notification-time">{timeAgo(n.issuedAt)}</span>
              </div>
              <button
                className="notification-dismiss-btn"
                onClick={(e) => handleAcknowledge(e, n._id)}
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className="notification-bell-container">
      <button
        ref={bellRef}
        className={`notification-bell-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
        onClick={togglePanel}
        title={`${unreadCount} unread notifications`}
        id="notification-bell"
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>
      {panelContent}
    </div>
  );
};

export default NotificationBell;
