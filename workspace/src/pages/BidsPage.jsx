import React, { useState, useEffect, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { api } from '../api.js';
import { demoFleet, demoLoads, demoShipments } from '../data.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import OwnerBidReviewPanel from '../components/OwnerBidReviewPanel.jsx';
import {
  roleForUser,
  readLocal,
  normalizeOwnerBidRecord,
  bidDraftForLoad,
  normalizeOpenLoad,
  normalizeBookingShipment,
  normalizeTruck,
  uniqueBidRecords,
  ownerBidRecordsFromShipments,
  bidPayloadForDraft,
  saveLocal,
  statusLabel,
  money,
  navigate
} from '../utils/helpers.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceLoads = DEMO_MODE ? demoLoads : [];
const workspaceShipments = DEMO_MODE ? demoShipments : [];

export default function BidsPage({ notify, user }) {
  const role = roleForUser(user);
  const [items, setItems] = useState([]);
  const [ownerBookings, setOwnerBookings] = useState([]);
  const [localBids, setLocalBids] = useState(() => readLocal('bids').map(normalizeOwnerBidRecord));
  const [fleet, setFleet] = useState([]);
  const [busy, setBusy] = useState('');
  const [bidTarget, setBidTarget] = useState(null);
  const [bidDraft, setBidDraft] = useState(() => bidDraftForLoad(null));
  const [matchOptions, setMatchOptions] = useState({});

  useEffect(() => {
    if (role === 'owner') {
      api
        .listOpenBookings()
        .then((data) => {
          const bookings = Array.isArray(data.bookings) ? data.bookings : [];
          setItems(bookings.map(normalizeOpenLoad));
        })
        .catch(() => setItems(workspaceLoads));

      api
        .listBookings()
        .then((data) => {
          const bookings = Array.isArray(data.bookings) ? data.bookings : [];
          setOwnerBookings(bookings.map(normalizeBookingShipment));
        })
        .catch(() => {});

      api
        .fleetTrucks()
        .then((data) => Array.isArray(data.trucks) && setFleet(data.trucks.map(normalizeTruck)))
        .catch(() => setFleet(workspaceFleet.slice(0, 3)));
      return;
    }

    api
      .listBookings()
      .then((data) => {
        const bookings = Array.isArray(data.bookings) ? data.bookings : [];
        setItems(bookings.map(normalizeBookingShipment));
      })
      .catch(() => setItems(workspaceShipments));
  }, [role]);

  const ownerBidRecords = useMemo(
    () => uniqueBidRecords([...ownerBidRecordsFromShipments(ownerBookings, user), ...localBids]),
    [localBids, ownerBookings, user]
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
    const localPayload = {
      ...payload,
      bookingId: bidTarget.id,
      route: bidTarget.route,
      cargo: bidTarget.cargo,
      status: 'submitted'
    };

    setBusy(`bid-${bidTarget.id || bidTarget.route}`);
    try {
      if (!bidTarget.id) throw new Error('Bid needs a synced booking');
      const data = await api.submitBookingBid(bidTarget.id, payload);
      if (data.booking) {
        const updated = normalizeBookingShipment(data.booking);
        setOwnerBookings((current) => [
          updated,
          ...current.filter(
            (booking) => String(booking.bookingId || booking.id) !== String(updated.bookingId || updated.id)
          )
        ]);
      }
      setItems((current) => current.filter((load) => String(load.id || load.bookingId) !== String(bidTarget.id)));
      notify(`Bid submitted for ${bidTarget.route}. Moved to My Bids.`);
      setBidTarget(null);
    } catch (err) {
      const record = saveLocal('bids', localPayload);
      setLocalBids((current) => [normalizeOwnerBidRecord(record), ...current]);
      setItems((current) => current.filter((load) => String(load.id || load.bookingId) !== String(bidTarget.id)));
      setBidTarget(null);
      notify(err.message || 'Bid held in My Bids until account sync completes');
    } finally {
      setBusy('');
    }
  }

  async function acceptBid(booking, bid) {
    setBusy(`${booking.bookingId}-${bid.id}`);
    try {
      const data = await api.acceptBookingBid(booking.bookingId, bid.id);
      const updated = normalizeBookingShipment(data.booking || {});
      setItems((current) => current.map((item) => (item.bookingId === updated.bookingId ? updated : item)));
      notify(`Awarded ${bid.ownerName}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  function replaceBooking(data, setter = setItems) {
    if (!data?.booking) return;
    const updated = normalizeBookingShipment(data.booking);
    setter((current) =>
      current.map((item) =>
        String(item.bookingId || item.id) === String(updated.bookingId || updated.id) ? updated : item
      )
    );
  }

  async function counterBid(booking, bid) {
    const amount = Number(window.prompt('Counteroffer amount', String(bid.amount || '')) || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const message = window.prompt('Counteroffer note', 'Please confirm this revised rate.') || '';
    setBusy(`counter-${bid.id}`);
    try {
      const data = await api.counterBookingBid(booking.bookingId, bid.id, { amount, message });
      replaceBooking(data);
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
      const data = await api.rejectBookingBid(booking.bookingId, bid.id, { reason: reason.trim() });
      replaceBooking(data);
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
      const data = await api.respondBookingCounter(bid.bookingId, bid.bidId, { decision, reason });
      replaceBooking(data, setOwnerBookings);
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
      const data = await api.withdrawBookingBid(bid.bookingId, bid.bidId, { reason });
      replaceBooking(data, setOwnerBookings);
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
      const data = await api.acknowledgeBookingBid(bid.bookingId, bid.bidId);
      replaceBooking(data, setOwnerBookings);
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
      const data = await api.autoAssignBooking(booking.bookingId);
      replaceBooking(data);
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
            <div className="shipment-stack">
              {availableOwnerLoads.length ? (
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
              ) : (
                <EmptyState title="No unbid loads" detail="Submitted offers are tracked below in My Bids." />
              )}
            </div>
          </Panel>
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
            <div className="bid-options">
              {ownerBidRecords.length ? (
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
              ) : (
                <EmptyState
                  title="No bids submitted"
                  detail="Review an available load, enter your rate, and place a bid."
                />
              )}
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
          <div className="cards-grid">
            {items.length ? (
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
            ) : (
              <EmptyState title="No bid records" detail="Create a shipment request to receive carrier bids." />
            )}
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
