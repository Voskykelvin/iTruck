import { useState, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import AsyncState from '../components/AsyncState.jsx';
import OwnerBidReviewPanel from '../components/OwnerBidReviewPanel.jsx';
import { useBookingAction, useBookings, useFleetTrucks, useOpenBookings } from '../queries/commercial.js';
import {
  roleForUser,
  bidDraftForLoad,
  uniqueBidRecords,
  ownerBidRecordsFromShipments,
  bidPayloadForDraft,
  statusLabel,
  money,
  navigate
} from '../utils/helpers.js';

const EMPTY_RESULTS = [];

export default function BidsPage({ notify, user }) {
  const role = roleForUser(user);
  const [busy, setBusy] = useState('');
  const [bidTarget, setBidTarget] = useState(null);
  const [bidDraft, setBidDraft] = useState(() => bidDraftForLoad(null));
  const [matchOptions, setMatchOptions] = useState({});
  const ownerMode = role === 'owner';
  const bookingsQuery = useBookings();
  const openBookingsQuery = useOpenBookings({ enabled: ownerMode });
  const fleetQuery = useFleetTrucks({ enabled: ownerMode });
  const bookingAction = useBookingAction(({ action }) => action());
  const items = ownerMode ? openBookingsQuery.data || EMPTY_RESULTS : bookingsQuery.data || EMPTY_RESULTS;
  const ownerBookings = ownerMode ? bookingsQuery.data || EMPTY_RESULTS : EMPTY_RESULTS;
  const fleet = ownerMode ? fleetQuery.data || EMPTY_RESULTS : EMPTY_RESULTS;

  const ownerBidRecords = useMemo(
    () => uniqueBidRecords(ownerBidRecordsFromShipments(ownerBookings, user)),
    [ownerBookings, user]
  );
  const ownerBidLoadIds = useMemo(
    () => new Set(ownerBidRecords.map((record) => String(record.bookingId)).filter(Boolean)),
    [ownerBidRecords]
  );
  const availableOwnerLoads = useMemo(
    () => items.filter((load) => !load.bidSubmitted && !ownerBidLoadIds.has(String(load.id || load.bookingId))),
    [items, ownerBidLoadIds]
  );

  function openOwnerBidReview(load) {
    setBidTarget(load);
    setBidDraft(bidDraftForLoad(load, fleet));
  }

  function updateBidDraft(key, value) {
    setBidDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitOwnerBid(event) {
    event.preventDefault();
    if (!bidTarget) return;

    const amount = Number(bidDraft.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Enter a bid amount greater than zero');
      return;
    }

    const payload = bidPayloadForDraft(bidDraft, fleet);
    setBusy(`bid-${bidTarget.id || bidTarget.route}`);
    try {
      if (!bidTarget.id) throw new Error('Bid needs a synced booking');
      await bookingAction.mutateAsync({
        action: () => api.submitBookingBid(bidTarget.id, payload),
        removeFromOpen: true
      });
      notify(`Bid submitted for ${bidTarget.route}. Moved to My Bids.`);
      setBidTarget(null);
    } catch (err) {
      notify(err.message || 'Bid was not submitted. Try again.');
    } finally {
      setBusy('');
    }
  }

  async function acceptBid(booking, bid) {
    setBusy(`${booking.bookingId}-${bid.id}`);
    try {
      await bookingAction.mutateAsync({ action: () => api.acceptBookingBid(booking.bookingId, bid.id) });
      notify(`Awarded ${bid.ownerName}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function counterBid(booking, bid) {
    const amount = Number(window.prompt('Counteroffer amount', String(bid.amount || '')) || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const message = window.prompt('Counteroffer note', 'Please confirm this revised rate.') || '';
    setBusy(`counter-${bid.id}`);
    try {
      await bookingAction.mutateAsync({
        action: () => api.counterBookingBid(booking.bookingId, bid.id, { amount, message })
      });
      notify('Counteroffer sent to carrier');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function rejectBid(booking, bid) {
    const reason = window.prompt('Reason for rejecting this bid');
    if (!reason?.trim()) return;
    setBusy(`reject-${bid.id}`);
    try {
      await bookingAction.mutateAsync({
        action: () => api.rejectBookingBid(booking.bookingId, bid.id, { reason: reason.trim() })
      });
      notify('Bid rejected with reason');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function respondToCounter(bid, decision) {
    const reason =
      decision === 'reject' ? window.prompt('Reason for declining this counteroffer') || '' : 'Counteroffer accepted';
    setBusy(`counter-response-${bid.bidId}`);
    try {
      await bookingAction.mutateAsync({
        action: () => api.respondBookingCounter(bid.bookingId, bid.bidId, { decision, reason })
      });
      notify(`Counteroffer ${decision === 'accept' ? 'accepted' : 'declined'}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function withdrawBid(bid) {
    const reason = window.prompt('Optional withdrawal reason') || '';
    setBusy(`withdraw-${bid.bidId}`);
    try {
      await bookingAction.mutateAsync({ action: () => api.withdrawBookingBid(bid.bookingId, bid.bidId, { reason }) });
      notify('Bid withdrawn');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function acknowledgeBid(bid) {
    setBusy(`ack-${bid.bidId}`);
    try {
      await bookingAction.mutateAsync({ action: () => api.acknowledgeBookingBid(bid.bookingId, bid.bidId) });
      notify('Bid decision acknowledged');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function loadMatches(booking) {
    setBusy(`matches-${booking.bookingId}`);
    try {
      const data = await api.bookingMatches(booking.bookingId);
      setMatchOptions((current) => ({ ...current, [booking.bookingId]: data.matches || [] }));
      notify(`${data.matches?.length || 0} verified truck matches found`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function autoAssign(booking) {
    setBusy(`auto-${booking.bookingId}`);
    try {
      const data = await bookingAction.mutateAsync({ action: () => api.autoAssignBooking(booking.bookingId) });
      notify(`Assigned ${data.truck?.plateNumber || 'best verified truck'}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  if (role === 'owner') {
    return (
      <section className="workspace-layout">
        <div className="stack">
          <Panel title="Available Loads" eyebrow="Find Work">
            {openBookingsQuery.isPending ? (
              <p className="refresh-status" role="status">
                Loading live opportunities...
              </p>
            ) : null}
            {openBookingsQuery.isError ? (
              <AsyncState
                compact
                title="Available loads unavailable"
                detail={openBookingsQuery.error?.message || 'Open shipment requests could not be loaded.'}
                onRetry={() => openBookingsQuery.refetch()}
              />
            ) : null}
            <div className="shipment-stack">
              {!openBookingsQuery.isPending && availableOwnerLoads.length ? (
                availableOwnerLoads.map((load) => (
                  <article className="load-row" key={load.id || load.route}>
                    <div>
                      <StatusBadge tone={load.risk === 'High' ? 'warn' : 'success'}>{load.fit}</StatusBadge>
                      <h3>{load.cargo}</h3>
                      <p>{load.route}</p>
                      <small>
                        {load.distance} - {load.window}
                      </small>
                    </div>
                    <div>
                      <strong>{money(load.price)}</strong>
                      <button
                        className="primary"
                        type="button"
                        disabled={busy === `bid-${load.id || load.route}`}
                        onClick={() => openOwnerBidReview(load)}
                      >
                        Review Bid
                      </button>
                    </div>
                  </article>
                ))
              ) : !openBookingsQuery.isPending && !openBookingsQuery.isError ? (
                <EmptyState title="No unbid loads" detail="Submitted offers are tracked below in My Bids." />
              ) : null}
            </div>
          </Panel>
          {fleetQuery.isError ? (
            <AsyncState
              compact
              title="Fleet options unavailable"
              detail="You can review the load, but vehicle selection requires a live fleet refresh."
              onRetry={() => fleetQuery.refetch()}
            />
          ) : null}
          <OwnerBidReviewPanel
            load={bidTarget}
            draft={bidDraft}
            fleet={fleet}
            busy={Boolean(busy)}
            onChange={updateBidDraft}
            onSubmit={submitOwnerBid}
            onClose={() => setBidTarget(null)}
          />
          <Panel title="My Bids" eyebrow="Submitted Offers">
            {bookingsQuery.isPending ? (
              <p className="refresh-status" role="status">
                Loading submitted offers...
              </p>
            ) : null}
            {bookingsQuery.isError ? (
              <AsyncState
                compact
                title="Submitted offers unavailable"
                detail={bookingsQuery.error?.message || 'Your bid history could not be loaded.'}
                onRetry={() => bookingsQuery.refetch()}
              />
            ) : null}
            <div className="bid-options">
              {!bookingsQuery.isPending && ownerBidRecords.length ? (
                ownerBidRecords.map((bid) => (
                  <div className="bid-option" key={bid.id}>
                    <div>
                      <StatusBadge tone={bid.status === 'accepted' ? 'success' : 'default'}>
                        {statusLabel(bid.status)}
                      </StatusBadge>
                      <strong>{bid.route}</strong>
                      <span>{bid.cargo}</span>
                      <small>{bid.message}</small>
                      {bid.counteroffer?.status === 'pending' ? (
                        <small>Shipper counter: {money(bid.counteroffer.amount)}</small>
                      ) : null}
                      {bid.rejectionReason || bid.withdrawalReason ? (
                        <small>{bid.rejectionReason || bid.withdrawalReason}</small>
                      ) : null}
                    </div>
                    <div>
                      <strong>{money(bid.amount)}</strong>
                      <div className="stack-actions compact-actions">
                        {bid.status === 'countered' ? (
                          <>
                            <button
                              className="primary"
                              type="button"
                              disabled={busy === `counter-response-${bid.bidId}`}
                              onClick={() => respondToCounter(bid, 'accept')}
                            >
                              Accept Counter
                            </button>
                            <button
                              className="ghost"
                              type="button"
                              disabled={busy === `counter-response-${bid.bidId}`}
                              onClick={() => respondToCounter(bid, 'reject')}
                            >
                              Decline
                            </button>
                          </>
                        ) : null}
                        {['pending', 'countered'].includes(bid.status) ? (
                          <button
                            className="ghost"
                            type="button"
                            disabled={busy === `withdraw-${bid.bidId}`}
                            onClick={() => withdrawBid(bid)}
                          >
                            Withdraw
                          </button>
                        ) : null}
                        {['accepted', 'rejected', 'expired'].includes(bid.status) && !bid.carrierAcknowledgedAt ? (
                          <button
                            className="secondary"
                            type="button"
                            disabled={busy === `ack-${bid.bidId}`}
                            onClick={() => acknowledgeBid(bid)}
                          >
                            Acknowledge
                          </button>
                        ) : null}
                        <button
                          className="ghost"
                          type="button"
                          onClick={() => navigate(`/app/tracking?shipment=${encodeURIComponent(bid.bookingId)}`)}
                        >
                          Open
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              ) : !bookingsQuery.isPending && !bookingsQuery.isError ? (
                <EmptyState
                  title="No bids submitted"
                  detail="Review an available load, enter your rate, and place a bid."
                />
              ) : null}
            </div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel title="Owner Rules" eyebrow="Bidding">
            <div className="doc-list compact">
              <span>Review the load before entering a rate</span>
              <span>Share vehicle readiness in the bid note</span>
              <span>Start pickup only after the shipper awards the job</span>
            </div>
          </Panel>
        </aside>
      </section>
    );
  }

  return (
    <section className="workspace-layout">
      <div className="stack">
        <Panel title="Bids Received" eyebrow="Shipper Review">
          {bookingsQuery.isPending ? (
            <p className="refresh-status" role="status">
              Loading live carrier offers...
            </p>
          ) : null}
          {bookingsQuery.isError ? (
            <AsyncState
              compact
              title="Carrier offers unavailable"
              detail={bookingsQuery.error?.message || 'Bid records could not be loaded.'}
              onRetry={() => bookingsQuery.refetch()}
            />
          ) : null}
          <div className="cards-grid">
            {!bookingsQuery.isPending && items.length ? (
              items.map((booking) => (
                <article className="quote-card" key={booking.id}>
                  <StatusBadge tone={booking.bids?.length ? 'warn' : 'default'}>{booking.status}</StatusBadge>
                  <h3>{booking.route}</h3>
                  <p>{booking.cargo}</p>
                  <small>{booking.bids?.length || 0} carrier bids</small>
                  <div className="button-row">
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy === `matches-${booking.bookingId}`}
                      onClick={() => loadMatches(booking)}
                    >
                      {busy === `matches-${booking.bookingId}` ? 'Ranking...' : 'Find Verified Trucks'}
                    </button>
                    <button
                      className="primary"
                      type="button"
                      disabled={busy === `auto-${booking.bookingId}` || booking.rawStatus !== 'bidding'}
                      onClick={() => autoAssign(booking)}
                    >
                      {busy === `auto-${booking.bookingId}` ? 'Assigning...' : 'Auto Assign Best'}
                    </button>
                  </div>
                  {(matchOptions[booking.bookingId] || []).length ? (
                    <div className="match-preview">
                      {matchOptions[booking.bookingId].slice(0, 3).map((match) => (
                        <div key={match.truck.id}>
                          <strong>
                            {match.truck.plateNumber} · {match.score}% match
                          </strong>
                          <span>{match.reasons.join(' · ')}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="bid-options">
                    {(booking.bids || []).length ? (
                      booking.bids.map((bid) => (
                        <div className="bid-option" key={bid.id}>
                          <div>
                            <StatusBadge tone={bid.status === 'accepted' ? 'success' : 'default'}>
                              {statusLabel(bid.status)}
                            </StatusBadge>
                            <strong>{bid.ownerName}</strong>
                            <span>{bid.truckName}</span>
                            <small>{bid.message}</small>
                            {bid.counteroffer?.status === 'pending' ? (
                              <small>Counteroffer awaiting carrier: {money(bid.counteroffer.amount)}</small>
                            ) : null}
                            {bid.rejectionReason || bid.withdrawalReason ? (
                              <small>{bid.rejectionReason || bid.withdrawalReason}</small>
                            ) : null}
                          </div>
                          <div>
                            <strong>{money(bid.amount)}</strong>
                            <div className="stack-actions compact-actions">
                              {bid.status === 'pending' ? (
                                <>
                                  <button
                                    className="primary"
                                    type="button"
                                    disabled={busy === `${booking.bookingId}-${bid.id}`}
                                    onClick={() => acceptBid(booking, bid)}
                                  >
                                    Award
                                  </button>
                                  <button
                                    className="secondary"
                                    type="button"
                                    disabled={busy === `counter-${bid.id}`}
                                    onClick={() => counterBid(booking, bid)}
                                  >
                                    Counter
                                  </button>
                                  <button
                                    className="ghost"
                                    type="button"
                                    disabled={busy === `reject-${bid.id}`}
                                    onClick={() => rejectBid(booking, bid)}
                                  >
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <StatusBadge tone={bid.status === 'accepted' ? 'success' : 'default'}>
                                  {statusLabel(bid.status)}
                                </StatusBadge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <span className="muted-note">No carrier offers yet.</span>
                    )}
                  </div>
                </article>
              ))
            ) : !bookingsQuery.isPending && !bookingsQuery.isError ? (
              <EmptyState title="No bid records" detail="Create a shipment request to receive carrier bids." />
            ) : null}
          </div>
        </Panel>
      </div>
      <aside className="side-stack">
        <Panel title="Next Step" eyebrow="Shipping">
          <button className="primary full icon-label" type="button" onClick={() => navigate('/app/book')}>
            <Plus size={18} />
            <span>Create Request</span>
          </button>
        </Panel>
      </aside>
    </section>
  );
}
