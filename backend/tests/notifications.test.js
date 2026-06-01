jest.mock('../models/Notification', () => ({
  create: jest.fn((payload) => Promise.resolve({ _id: 'note-test', ...payload }))
}));

const Notification = require('../models/Notification');
const notifications = require('../services/notifications');

beforeEach(() => {
  Notification.create.mockClear();
});

test('deliver creates a push notification with title and message', async () => {
  const note = await notifications.deliver('user-1', 'shipment:update', {
    title: 'In transit',
    message: 'Driver departed'
  });
  expect(note.title).toBe('In transit');
  expect(Notification.create).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'user-1',
      type: 'shipment:update',
      channels: { push: true, email: false, sms: false }
    })
  );
});

test('notifyBookingParties skips empty party ids', async () => {
  await notifications.notifyBookingParties({ client: 'client-1', owner: null }, 'booking:update', { title: 'Updated' });
  expect(Notification.create).toHaveBeenCalledTimes(1);
});
