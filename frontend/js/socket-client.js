class ITruckSocket {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect() {
    if (window.io && !this.socket) {
      this.socket = window.io();
      this.socket.on('tracking:update', (data) => this.emit('tracking:update', data));
    }
    return this;
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  emit(event, data) {
    (this.listeners.get(event) || []).forEach((handler) => handler(data));
  }

  joinBooking(id) {
    if (this.socket) this.socket.emit('booking:join', id);
    localStorage.setItem('itruck_active_booking_channel', id);
  }

  sendLocation(id, coords) {
    const payload = { id, coords, timestamp: new Date().toISOString() };
    if (this.socket) this.socket.emit('tracking:location', payload);
    const key = 'itruck_location_updates';
    const updates = JSON.parse(localStorage.getItem(key) || '[]');
    updates.push(payload);
    localStorage.setItem(key, JSON.stringify(updates.slice(-40)));
    this.emit('tracking:update', payload);
  }
}

window.iTruckSocket = new ITruckSocket();
