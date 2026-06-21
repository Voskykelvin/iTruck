const AppError = require('../utils/AppError');

const ACTIVE_BID_STATUSES = ['pending', 'countered'];
const TERMINAL_BID_STATUSES = ['accepted', 'rejected', 'withdrawn', 'expired'];

function bidId(bid) {
  return String(bid?._id || bid?.id || '');
}

function findBid(booking, id) {
  const direct = booking.bids?.id?.(id);
  if (direct) return direct;
  return (booking.bids || []).find((bid) =>
    [bidId(bid), bid.owner?._id || bid.owner, bid.truck?._id || bid.truck].some(
      (value) => value && String(value) === String(id)
    )
  );
}

function history(bid, action, actor, values = {}) {
  bid.history = bid.history || [];
  bid.history.push({
    action,
    actor: actor?._id || actor,
    amount: values.amount,
    message: values.message,
    reason: values.reason,
    createdAt: values.createdAt || new Date()
  });
  bid.updatedAt = values.createdAt || new Date();
}

function expireBidIfNeeded(bid, now = new Date(), actor) {
  if (!ACTIVE_BID_STATUSES.includes(bid.status) || !bid.expiresAt || new Date(bid.expiresAt) > now) return false;
  bid.status = 'expired';
  if (bid.counteroffer?.status === 'pending') bid.counteroffer.status = 'expired';
  history(bid, 'expired', actor, { createdAt: now, reason: 'Offer validity window ended' });
  return true;
}

function expireBids(booking, now = new Date(), actor) {
  return (booking.bids || []).reduce((count, bid) => count + (expireBidIfNeeded(bid, now, actor) ? 1 : 0), 0);
}

function assertActive(bid, now = new Date()) {
  expireBidIfNeeded(bid, now);
  if (!ACTIVE_BID_STATUSES.includes(bid.status)) {
    throw new AppError(`Bid is ${bid.status} and cannot be changed`, 409);
  }
}

function assertBidOwner(actor, bid) {
  if (actor.role === 'admin' || String(bid.owner?._id || bid.owner) === String(actor._id)) return;
  throw new AppError('Only the bidding carrier can perform this action', 403);
}

function submitBid(booking, actor, payload, truck) {
  expireBids(booking);
  const duplicate = (booking.bids || []).find(
    (bid) => String(bid.owner?._id || bid.owner) === String(actor._id) && ACTIVE_BID_STATUSES.includes(bid.status)
  );
  if (duplicate) throw new AppError('Withdraw or complete your current bid before submitting another', 409);

  const now = new Date();
  const amount = Number(payload.amount);
  const expiresAt = payload.expiresAt ? new Date(payload.expiresAt) : new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const bid = {
    owner: actor._id,
    truck: truck?._id || payload.truck,
    amount,
    originalAmount: amount,
    message: payload.message || '',
    status: 'pending',
    expiresAt,
    createdAt: now,
    updatedAt: now,
    history: [{ action: 'submitted', actor: actor._id, amount, message: payload.message || '', createdAt: now }]
  };
  booking.bids.push(bid);
  return booking.bids.at(-1);
}

function counterBid(booking, id, actor, payload) {
  const bid = findBid(booking, id);
  if (!bid) throw new AppError('Bid not found', 404);
  assertActive(bid);
  if (bid.status === 'countered' && bid.counteroffer?.status === 'pending') {
    throw new AppError('Carrier response is still pending for the current counteroffer', 409);
  }
  const now = new Date();
  bid.status = 'countered';
  bid.counteroffer = {
    amount: Number(payload.amount),
    message: payload.message || '',
    status: 'pending',
    createdBy: actor._id,
    createdAt: now
  };
  if (payload.expiresAt) bid.expiresAt = new Date(payload.expiresAt);
  history(bid, 'countered', actor, {
    amount: bid.counteroffer.amount,
    message: bid.counteroffer.message,
    createdAt: now
  });
  return bid;
}

function respondToCounter(booking, id, actor, payload) {
  const bid = findBid(booking, id);
  if (!bid) throw new AppError('Bid not found', 404);
  assertBidOwner(actor, bid);
  assertActive(bid);
  if (bid.status !== 'countered' || bid.counteroffer?.status !== 'pending') {
    throw new AppError('This bid does not have a pending counteroffer', 409);
  }
  const now = new Date();
  bid.counteroffer.respondedAt = now;
  bid.counteroffer.responseReason = payload.reason || '';
  if (payload.decision === 'accept') {
    bid.counteroffer.status = 'accepted';
    bid.amount = bid.counteroffer.amount;
    bid.status = 'pending';
    history(bid, 'counter_accepted', actor, {
      amount: bid.amount,
      message: bid.counteroffer.message,
      createdAt: now
    });
  } else {
    bid.counteroffer.status = 'rejected';
    bid.status = 'rejected';
    bid.rejectionReason = payload.reason || 'Carrier declined the counteroffer';
    bid.rejectedAt = now;
    history(bid, 'counter_rejected', actor, { reason: bid.rejectionReason, createdAt: now });
  }
  return bid;
}

function rejectBid(booking, id, actor, reason) {
  const bid = findBid(booking, id);
  if (!bid) throw new AppError('Bid not found', 404);
  assertActive(bid);
  const now = new Date();
  bid.status = 'rejected';
  bid.rejectionReason = reason;
  bid.rejectedAt = now;
  if (bid.counteroffer?.status === 'pending') bid.counteroffer.status = 'rejected';
  history(bid, 'rejected', actor, { reason, createdAt: now });
  return bid;
}

function withdrawBid(booking, id, actor, reason) {
  const bid = findBid(booking, id);
  if (!bid) throw new AppError('Bid not found', 404);
  assertBidOwner(actor, bid);
  assertActive(bid);
  const now = new Date();
  bid.status = 'withdrawn';
  bid.withdrawalReason = reason || '';
  bid.withdrawnAt = now;
  history(bid, 'withdrawn', actor, { reason, createdAt: now });
  return bid;
}

function acknowledgeBid(booking, id, actor) {
  const bid = findBid(booking, id);
  if (!bid) throw new AppError('Bid not found', 404);
  assertBidOwner(actor, bid);
  if (!TERMINAL_BID_STATUSES.includes(bid.status)) {
    throw new AppError('Only a final bid decision can be acknowledged', 409);
  }
  bid.carrierAcknowledgedAt = new Date();
  bid.updatedAt = bid.carrierAcknowledgedAt;
  return bid;
}

function acceptBid(booking, id, actor) {
  expireBids(booking);
  const bid = findBid(booking, id);
  if (!bid) throw new AppError('Bid not found', 404);
  if (bid.status !== 'pending') throw new AppError(`Bid is ${bid.status} and cannot be awarded`, 409);
  const now = new Date();
  booking.bids.forEach((item) => {
    if (bidId(item) === bidId(bid)) {
      item.status = 'accepted';
      history(item, 'accepted', actor, { amount: item.amount, createdAt: now });
    } else if (ACTIVE_BID_STATUSES.includes(item.status)) {
      item.status = 'rejected';
      item.rejectionReason = 'Another carrier was awarded this booking';
      item.rejectedAt = now;
      history(item, 'rejected', actor, { reason: item.rejectionReason, createdAt: now });
    }
  });
  return bid;
}

module.exports = {
  ACTIVE_BID_STATUSES,
  TERMINAL_BID_STATUSES,
  acceptBid,
  acknowledgeBid,
  counterBid,
  expireBidIfNeeded,
  expireBids,
  findBid,
  rejectBid,
  respondToCounter,
  submitBid,
  withdrawBid
};
