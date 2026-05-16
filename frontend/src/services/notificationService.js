// ======================================================
// NOTIFICATION SERVICE
// Handles browser and internal toast notifications
// ======================================================

class NotificationService {
  requestPermission() {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  }

  notify(title, options) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, options);
    }
  }
}

export const notificationService = new NotificationService();
