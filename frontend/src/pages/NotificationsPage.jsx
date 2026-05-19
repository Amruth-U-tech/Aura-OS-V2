import { useEffect, useState } from 'react';
import { useNotifications } from '@context/NotificationContext';
import './NotificationsPage.css';

// ======================================================
// NOTIFICATIONS PAGE — Phase N1
// Full persistent notification history with categories
//
// Features:
//   - Category filter tabs
//   - Read/acknowledge actions
//   - Mark all read
//   - Notification history replay
//   - Time-ago display
// ======================================================

const CATEGORY_ICONS = {
  ALL: '📋',
  SOCIAL: '👥',
  CHALLENGE: '⚔️',
  HUB: '🌐',
  SYSTEM: '⚙️',
  REWARD: '🎁',
  TASK: '✅'
};

const CATEGORIES = ['ALL', 'SOCIAL', 'CHALLENGE', 'HUB', 'TASK', 'REWARD', 'SYSTEM'];

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

const NotificationsPage = () => {
  const {
    notifications,
    unreadCount,
    loading,
    fetchNotifications,
    markRead,
    markAllRead,
    acknowledge
  } = useNotifications();

  const [activeCategory, setActiveCategory] = useState('ALL');

  useEffect(() => {
    fetchNotifications({ force: true });
  }, [fetchNotifications]);

  const filtered = activeCategory === 'ALL'
    ? notifications
    : notifications.filter(n => n.category === activeCategory);

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);
    if (cat !== 'ALL') {
      fetchNotifications({ force: true, category: cat });
    } else {
      fetchNotifications({ force: true });
    }
  };

  return (
    <div className="notifications-page">
      <div className="notifications-page-header">
        <div className="notifications-page-title-row">
          <h1>Notifications</h1>
          {unreadCount > 0 && (
            <span className="notifications-unread-badge">{unreadCount} unread</span>
          )}
        </div>
        {unreadCount > 0 && (
          <button className="notifications-mark-all-btn" onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      {/* Category Tabs */}
      <div className="notifications-categories">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            className={`category-tab ${activeCategory === cat ? 'active' : ''}`}
            onClick={() => handleCategoryChange(cat)}
          >
            <span className="category-tab-icon">{CATEGORY_ICONS[cat]}</span>
            {cat}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="notifications-page-list">
        {loading && notifications.length === 0 ? (
          <div className="notifications-loading">Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div className="notifications-empty">
            <span className="notifications-empty-icon">📭</span>
            <h3>No notifications</h3>
            <p>You&apos;re all caught up!</p>
          </div>
        ) : (
          filtered.map(n => (
            <div
              key={n._id}
              className={`notifications-page-item ${!n.read ? 'unread' : ''} ${n.acknowledged ? 'acknowledged' : ''}`}
              onClick={() => !n.read && markRead(n._id)}
            >
              <div className="notifications-page-item-icon">
                {CATEGORY_ICONS[n.category] || '📬'}
                {!n.read && <span className="notifications-page-unread-dot" />}
              </div>
              <div className="notifications-page-item-body">
                <div className="notifications-page-item-title">{n.title}</div>
                {n.message && (
                  <div className="notifications-page-item-message">{n.message}</div>
                )}
                <div className="notifications-page-item-meta">
                  <span className="notifications-page-item-time">{timeAgo(n.issuedAt)}</span>
                  <span className="notifications-page-item-category">{n.category}</span>
                </div>
              </div>
              <div className="notifications-page-item-actions">
                {!n.acknowledged && (
                  <button
                    className="notifications-page-dismiss"
                    onClick={(e) => { e.stopPropagation(); acknowledge(n._id); }}
                    title="Dismiss"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationsPage;
