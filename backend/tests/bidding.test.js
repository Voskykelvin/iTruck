const {
  acceptBid,
  acknowledgeBid,
  counterBid,
  expireBids,
  rejectBid,
  respondToCounter,
  submitBid,
  withdrawBid,
  findBid,
  expireBidIfNeeded
} = require('../services/bidding');

function actor(id, role) {
  return { _id: id, role };
}

function booking() {
  return { _id: 'booking-1', bids: [] };
}

describe('Bidding Service Unit Tests', () => {
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

  // Additional tests to reach 100% coverage
  test('findBid matches by owner, truck or mongoose subdocument helper', () => {
    const record = booking();
    const bid = {
      _id: 'bid-123',
      owner: { _id: 'owner-123' },
      truck: 'truck-123',
      status: 'pending'
    };
    record.bids.push(bid);
    
    // Test findBid subdocument mock helper
    record.bids.id = (id) => (id === 'bid-123' ? bid : null);

    expect(findBid(record, 'bid-123')).toEqual(bid);
    expect(findBid(record, 'owner-123')).toEqual(bid);
    expect(findBid(record, 'truck-123')).toEqual(bid);
    expect(findBid(record, 'nonexistent')).toBeUndefined();
  });

  test('expireBidIfNeeded returns false for inactive, unexpired or missing expiresAt bids', () => {
    const actorUser = actor('admin-1', 'admin');
    
    // Inactive status
    expect(expireBidIfNeeded({ status: 'accepted' }, new Date(), actorUser)).toBe(false);
    
    // Missing expiresAt
    expect(expireBidIfNeeded({ status: 'pending' }, new Date(), actorUser)).toBe(false);
    
    // Not yet expired
    const futureDate = new Date(Date.now() + 100000);
    expect(expireBidIfNeeded({ status: 'pending', expiresAt: futureDate }, new Date(), actorUser)).toBe(false);
  });

  test('expireBidIfNeeded expires counteroffer status if pending', () => {
    const actorUser = actor('admin-1', 'admin');
    const pastDate = new Date(Date.now() - 100000);
    const bid = {
      status: 'countered',
      expiresAt: pastDate,
      counteroffer: { status: 'pending' },
      history: []
    };
    expect(expireBidIfNeeded(bid, new Date(), actorUser)).toBe(true);
    expect(bid.status).toBe('expired');
    expect(bid.counteroffer.status).toBe('expired');
  });

  test('submitBid supports custom expiresAt', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const customExpiry = new Date(Date.now() + 50000);
    const bid = submitBid(record, owner, { amount: 1000, expiresAt: customExpiry });
    expect(bid.expiresAt).toEqual(customExpiry);
  });

  test('assertBidOwner allows admin role', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const bid = submitBid(record, owner, { amount: 1000 });
    bid._id = 'bid-1';

    const adminUser = actor('admin-1', 'admin');
    const foreignUser = actor('owner-2', 'owner');

    expect(() => withdrawBid(record, 'bid-1', adminUser, 'Admin intervention')).not.toThrow();
    
    const bid2 = submitBid(record, foreignUser, { amount: 1200 });
    bid2._id = 'bid-2';
    expect(() => withdrawBid(record, 'bid-2', owner, 'Not the owner')).toThrow(
      'Only the bidding carrier can perform this action'
    );
  });

  test('counterBid and respondToCounter and rejectBid throw 404 when bid is not found', () => {
    const record = booking();
    const client = actor('client-1', 'client');
    const owner = actor('owner-1', 'owner');

    expect(() => counterBid(record, 'nonexistent', client, { amount: 100 })).toThrow('Bid not found');
    expect(() => respondToCounter(record, 'nonexistent', owner, { decision: 'accept' })).toThrow('Bid not found');
    expect(() => rejectBid(record, 'nonexistent', client, 'reason')).toThrow('Bid not found');
    expect(() => withdrawBid(record, 'nonexistent', owner, 'reason')).toThrow('Bid not found');
    expect(() => acknowledgeBid(record, 'nonexistent', owner)).toThrow('Bid not found');
    expect(() => acceptBid(record, 'nonexistent', client)).toThrow('Bid not found');
  });

  test('counterBid throws 409 if another counteroffer is already pending', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const client = actor('client-1', 'client');
    const bid = submitBid(record, owner, { amount: 1000 });
    bid._id = 'bid-1';

    counterBid(record, 'bid-1', client, { amount: 900 });
    expect(() => counterBid(record, 'bid-1', client, { amount: 800 })).toThrow(
      'Carrier response is still pending for the current counteroffer'
    );
  });

  test('respondToCounter rejects counteroffer decision and sets rejected status', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const client = actor('client-1', 'client');
    const bid = submitBid(record, owner, { amount: 1000 });
    bid._id = 'bid-1';

    counterBid(record, 'bid-1', client, { amount: 900 });
    respondToCounter(record, 'bid-1', owner, { decision: 'reject', reason: 'Too cheap' });

    expect(bid.status).toBe('rejected');
    expect(bid.counteroffer.status).toBe('rejected');
    expect(bid.rejectionReason).toBe('Too cheap');
  });

  test('respondToCounter throws 409 if no pending counteroffer exists', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const bid = submitBid(record, owner, { amount: 1000 });
    bid._id = 'bid-1';

    expect(() => respondToCounter(record, 'bid-1', owner, { decision: 'accept' })).toThrow(
      'This bid does not have a pending counteroffer'
    );
  });

  test('rejectBid rejects counteroffer if status is pending', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const client = actor('client-1', 'client');
    const bid = submitBid(record, owner, { amount: 1000 });
    bid._id = 'bid-1';

    counterBid(record, 'bid-1', client, { amount: 900 });
    rejectBid(record, 'bid-1', client, 'Changed my mind');

    expect(bid.status).toBe('rejected');
    expect(bid.counteroffer.status).toBe('rejected');
  });

  test('acknowledgeBid throws 409 if bid is not in terminal status', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    submitBid(record, owner, { amount: 1000 });
    record.bids[0]._id = 'bid-1';

    expect(() => acknowledgeBid(record, 'bid-1', owner)).toThrow(
      'Only a final bid decision can be acknowledged'
    );
  });

  test('acceptBid throws 409 if bid is not pending', () => {
    const record = booking();
    const owner = actor('owner-1', 'owner');
    const client = actor('client-1', 'client');
    const bid = submitBid(record, owner, { amount: 1000 });
    bid._id = 'bid-1';

    counterBid(record, 'bid-1', client, { amount: 900 });
    expect(() => acceptBid(record, 'bid-1', client)).toThrow('Bid is countered and cannot be awarded');
  });

  test('acceptBid rejects other active bids on the booking', () => {
    const record = booking();
    const owner1 = actor('owner-1', 'owner');
    const owner2 = actor('owner-2', 'owner');
    const client = actor('client-1', 'client');

    const bid1 = submitBid(record, owner1, { amount: 1000 });
    bid1._id = 'bid-1';
    
    // We need to bypass duplicate check for test purposes by modifying the bids array manually or using different owner
    const bid2 = submitBid(record, owner2, { amount: 1100 });
    bid2._id = 'bid-2';

    acceptBid(record, 'bid-1', client);
    expect(bid1.status).toBe('accepted');
    expect(bid2.status).toBe('rejected');
    expect(bid2.rejectionReason).toBe('Another carrier was awarded this booking');
  });
});
