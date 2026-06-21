const {
  acceptBid,
  acknowledgeBid,
  counterBid,
  expireBids,
  rejectBid,
  respondToCounter,
  submitBid,
  withdrawBid
} = require('../services/bidding');

function actor(id, role) {
  return { _id: id, role };
}

function booking() {
  return { _id: 'booking-1', bids: [] };
}

test('bid lifecycle supports counteroffer acceptance and award history', () => {
  const record = booking();
  const owner = actor('owner-1', 'owner');
  const client = actor('client-1', 'client');
  const bid = submitBid(record, owner, { amount: 1000, message: 'Ready' }, { _id: 'truck-1' });
  bid._id = 'bid-1';

  counterBid(record, 'bid-1', client, { amount: 920, message: 'Can you meet this rate?' });
  expect(bid.status).toBe('countered');
  expect(bid.counteroffer.amount).toBe(920);

  respondToCounter(record, 'bid-1', owner, { decision: 'accept' });
  expect(bid.status).toBe('pending');
  expect(bid.amount).toBe(920);

  acceptBid(record, 'bid-1', client);
  expect(bid.status).toBe('accepted');
  expect(bid.history.map((event) => event.action)).toEqual(['submitted', 'countered', 'counter_accepted', 'accepted']);
});

test('carriers can withdraw and acknowledge final decisions', () => {
  const record = booking();
  const owner = actor('owner-1', 'owner');
  const bid = submitBid(record, owner, { amount: 1000 }, { _id: 'truck-1' });
  bid._id = 'bid-1';

  withdrawBid(record, 'bid-1', owner, 'Truck maintenance');
  expect(bid.status).toBe('withdrawn');
  expect(() => acknowledgeBid(record, 'bid-1', owner)).not.toThrow();
  expect(bid.carrierAcknowledgedAt).toBeInstanceOf(Date);
});

test('rejections require a reason and active duplicate bids are blocked', () => {
  const record = booking();
  const owner = actor('owner-1', 'owner');
  const client = actor('client-1', 'client');
  const bid = submitBid(record, owner, { amount: 1000 }, { _id: 'truck-1' });
  bid._id = 'bid-1';

  expect(() => submitBid(record, owner, { amount: 1100 }, { _id: 'truck-2' })).toThrow(
    'Withdraw or complete your current bid'
  );
  rejectBid(record, 'bid-1', client, 'Pickup window is too late');
  expect(bid.status).toBe('rejected');
  expect(bid.rejectionReason).toBe('Pickup window is too late');
});

test('expired offers are removed from the actionable bid set', () => {
  const record = booking();
  const bid = {
    _id: 'bid-1',
    owner: 'owner-1',
    amount: 1000,
    status: 'pending',
    expiresAt: new Date('2026-06-21T10:00:00.000Z'),
    history: []
  };
  record.bids.push(bid);
  expect(expireBids(record, new Date('2026-06-21T11:00:00.000Z'))).toBe(1);
  expect(bid.status).toBe('expired');
  expect(bid.history.at(-1).action).toBe('expired');
});
