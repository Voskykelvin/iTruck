class NotificationsUI {
  notify(message, type = 'info') {
    let tray = document.getElementById('notificationTray');
    if (!tray) {
      tray = document.createElement('div');
      tray.id = 'notificationTray';
      tray.className = 'notification-tray';
      document.body.appendChild(tray);
    }

    const item = document.createElement('button');
    item.type = 'button';
    item.className = `notification-card ${type}`;
    item.innerHTML = `<strong>${type === 'error' ? 'Action needed' : 'iTruck update'}</strong><span>${message}</span>`;
    item.addEventListener('click', () => item.remove());
    tray.appendChild(item);
    setTimeout(() => item.remove(), 5200);
  }
}

window.NotificationsUI = new NotificationsUI();
