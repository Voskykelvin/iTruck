function sameId(left, right) {
  return String(left?._id || left || '') === String(right?._id || right || '');
}

function bookingVisibleTo(user, booking) {
  if (!user || !booking) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'client') return sameId(booking.client, user._id);
  if (user.role === 'driver') return sameId(booking.driver, user._id);
  if (user.role === 'owner') {
    if (['pending', 'bidding'].includes(booking.status) && !booking.owner) return true;
    return sameId(booking.owner, user._id) || (booking.bids || []).some((bid) => sameId(bid.owner, user._id));
  }
  return false;
}

function canManageBookingStatus(user, booking) {
  if (!user || !booking) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'driver') return sameId(booking.driver, user._id);
  return user.role === 'owner' && sameId(booking.owner, user._id);
}

function canCancelBooking(user, booking) {
  if (!user || !booking) return false;
  if (!['pending', 'bidding', 'confirmed'].includes(booking.status)) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'client') return sameId(booking.client, user._id);
  return user.role === 'owner' && sameId(booking.owner, user._id);
}

function canCaptureDeliveryProof(user, booking) {
  if (!user || !booking) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'driver') return sameId(booking.driver, user._id);
  return user.role === 'owner' && sameId(booking.owner, user._id);
}

function bookingQueryForUser(user, options = {}) {
  if (user.role === 'admin') return {};
  if (user.role === 'client') return { client: user._id };
  if (user.role === 'driver') return { driver: user._id };
  if (user.role === 'owner') {
    return options.includeBids === false
      ? { owner: user._id }
      : { $or: [{ owner: user._id }, { 'bids.owner': user._id }] };
  }
  return { _id: null };
}

module.exports = {
  bookingQueryForUser,
  bookingVisibleTo,
  canCancelBooking,
  canCaptureDeliveryProof,
  canManageBookingStatus,
  sameId
};
