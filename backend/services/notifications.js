const Notification = require('../models/Notification');

function userId(value) {
  return value?._id || value;
}

function notificationPayload(notification, type, data) {
  return {
    _id: notification?._id,
    id: notification?._id,
    type,
    title: notification?.title || data.title || type,
    message: notification?.message || data.message || '',
    read: Boolean(notification?.read),
    createdAt: notification?.createdAt || new Date().toISOString(),
    data
  };
}

async function deliver(user, type, data = {}, io) {
  const target = userId(user);
  const notification = await Notification.create({
    user: target,
    type,
    title: data.title || type,
    message: data.message || '',
    priority: data.priority || 'normal',
    channels: { push: true, email: false, sms: false },
    data
  });

  if (io?.emitToUser) io.emitToUser(target, 'notification:new', notificationPayload(notification, type, data));
  return notification;
}

module.exports = {
  deliver,
  notifyBookingParties: (booking, type, data, io) =>
    Promise.all([booking.client, booking.owner].filter(Boolean).map((u) => deliver(u, type, data, io)))
};
