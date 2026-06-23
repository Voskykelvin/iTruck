import { useState, useEffect, useMemo } from 'react';
import { Wallet, Truck, Gauge, ShieldCheck, Plus } from 'lucide-react';
import { api } from '../api.js';
import { demoFleet, demoLoads } from '../data.js';
import MetricCard from '../components/MetricCard.jsx';
import Panel from '../components/Panel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import OwnerBidReviewPanel from '../components/OwnerBidReviewPanel.jsx';
import {
  readLocal,
  normalizeOwnerBidRecord,
  bidDraftForLoad,
  normalizeTruck,
  normalizeOpenLoad,
  normalizeBookingShipment,
  uniqueBidRecords,
  ownerBidRecordsFromShipments,
  activateOnEnter,
  money,
  saveLocal,
  bidPayloadForDraft,
  navigate
} from '../utils/helpers.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceLoads = DEMO_MODE ? demoLoads : [];

export default function OwnerPage({ notify, user }) {
  const [fleet, setFleet] = useState(workspaceFleet.slice(0, 3));
  const [loads, setLoads] = useState(workspaceLoads);
  const [ownerBookings, setOwnerBookings] = useState([]);
  const [localBids, setLocalBids] = useState(() => readLocal('bids').map(normalizeOwnerBidRecord));
  const [draftPlate, setDraftPlate] = useState('');
  const [walletBalance, setWalletBalance] = useState(3180);
  const [bidTarget, setBidTarget] = useState(null);
  const [bidDraft, setBidDraft] = useState(() => bidDraftForLoad(null));
  const [bidBusy, setBidBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');

  useEffect(() => {
    api
      .fleetTrucks()
      .then((data) => {
        if (Array.isArray(data.trucks)) setFleet(data.trucks.map(normalizeTruck));
      })
      .catch(() => setFleet(workspaceFleet.slice(0, 3)));

    api
      .listOpenBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setLoads(data.bookings.map(normalizeOpenLoad));
      })
      .catch(() => setLoads(workspaceLoads));

    api
      .listBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setOwnerBookings(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => {});

    api
      .wallet()
      .then((data) => {
        if (Number.isFinite(Number(data.balance))) setWalletBalance(Number(data.balance));
      })
      .catch(() => {});
  }, []);

  const ownerBidRecords = useMemo(
    () => uniqueBidRecords([...ownerBidRecordsFromShipments(ownerBookings, user), ...localBids]),
    [localBids, ownerBookings, user]
  );
  const ownerBidLoadIds = useMemo(
    () => new Set(ownerBidRecords.map((record) => String(record.bookingId)).filter(Boolean)),
    [ownerBidRecords]
  );
  const availableLoads = useMemo(
    () => loads.filter((load) => !load.bidSubmitted && !ownerBidLoadIds.has(String(load.id || load.bookingId))),
    [loads, ownerBidLoadIds]
  );

  async function addTruck() {
    if (!draftPlate.trim()) {
      notify('Enter a plate number before adding a vehicle');
      return;
    }
    const payload = {
      plateNumber: draftPlate,
      type: 'Lorry',
      make: 'Owner',
      model: 'Listed vehicle',
      routes: ['Route pending'],
      isVerified: false
    };

    try {
      const data = await api.createTruck(payload);
      setFleet((current) => [normalizeTruck(data.truck || payload), ...current]);
      notify('Vehicle sent to admin review');
    } catch (_err) {
      const truck = normalizeTruck({ ...payload, id: draftPlate, plate: draftPlate });
      setFleet((current) => [truck, ...current]);
      saveLocal('vehicles', truck);
      notify('Sign in to save this vehicle to your fleet');
    } finally {
      setDraftPlate('');
    }
  }

  function openBidReview(load) {
    if (!load) {
      notify('No available load is ready for bidding');
      return;
    }

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

    setBidBusy(true);
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
      setLoads((current) => current.filter((load) => String(load.id || load.bookingId) !== String(bidTarget.id)));
      notify(`Bid submitted for ${bidTarget.route}. Moved to My Bids.`);
      setBidTarget(null);
    } catch (err) {
      const record = saveLocal('bids', localPayload);
      setLocalBids((current) => [normalizeOwnerBidRecord(record), ...current]);
      setLoads((current) => current.filter((load) => String(load.id || load.bookingId) !== String(bidTarget.id)));
      setBidTarget(null);
      notify(err.message || 'Bid held in My Bids until account sync completes');
    } finally {
      setBidBusy(false);
    }
  }

  function runOwnerQueue(label) {
    if (label.startsWith('Submit bid')) {
      openBidReview(availableLoads[0]);
      return;
    }

    if (label.startsWith('Upload insurance')) {
      navigate('/app/profile?document=Insurance');
      notify('Insurance upload opened');
      return;
    }

    confirmPickupStarted();
  }

  function openTruckReadiness(truck) {
    navigate(`/app/profile?document=${encodeURIComponent('Vehicle logbook')}&vehicle=${encodeURIComponent(truck.id)}`);
    notify(`${truck.plate} readiness opened`);
  }

  async function confirmPickupStarted() {
    const target =
      ownerBookings.find((booking) => booking.rawStatus === 'confirmed') ||
      ownerBookings.find((booking) => booking.rawStatus === 'in_transit');

    if (!target?.bookingId) {
      navigate('/app/tracking');
      notify('No assigned confirmed pickup is ready to start');
      return;
    }

    if (target.rawStatus === 'in_transit') {
      navigate(`/app/tracking?shipment=${encodeURIComponent(target.id)}`);
      notify(`Pickup already active for ${target.id}`);
      return;
    }

    try {
      const data = await api.updateBookingStatus(target.bookingId, {
        status: 'in_transit',
        location: { lat: -1.2921, lng: 36.8219, speed: 0, heading: 0 }
      });
      const updated = normalizeBookingShipment(data.booking || {});
      setOwnerBookings((current) => current.map((item) => (item.bookingId === target.bookingId ? updated : item)));
      notify(`Pickup started for ${updated.id}`);
      navigate(`/app/tracking?shipment=${encodeURIComponent(updated.id)}`);
    } catch (err) {
      notify(err.message);
    }
  }

  const activeJobs = ownerBookings.filter((booking) => ['confirmed', 'in_transit'].includes(booking.rawStatus)).length;
  const ratedFleet = fleet.filter((truck) => Number(truck.ratingCount || 0) > 0);
  const fleetRatingCount = ratedFleet.reduce((sum, truck) => sum + Number(truck.ratingCount || 0), 0);
  const fleetRatingAverage = fleetRatingCount
    ? ratedFleet.reduce((sum, truck) => sum + Number(truck.rating || 0) * Number(truck.ratingCount || 0), 0) /
      fleetRatingCount
    : 0;

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard icon={Wallet} label="Wallet Balance" value={money(walletBalance)} detail="Available for payout" />
        <MetricCard icon={Truck} label="Active Jobs" value={activeJobs} detail="Confirmed or in transit" />
        <MetricCard icon={Gauge} label="Open Loads" value={availableLoads.length} detail="Ready for owner bids" />
        <MetricCard
          icon={ShieldCheck}
          label="Rating"
          value={fleetRatingCount ? fleetRatingAverage.toFixed(1) : 'New'}
          detail={
            fleetRatingCount
              ? `${fleetRatingCount} delivered rating${fleetRatingCount === 1 ? '' : 's'}`
              : 'After completed jobs'
          }
        />
      </section>

      <section className="workspace-layout">
        <div className="stack">
          <Panel title="Job Board" eyebrow="Available Loads">
            <div className="shipment-stack">
              {availableLoads.length ? (
                availableLoads.map((load) => (
                  <article
                    className="load-row"
                    key={load.route}
                    role="button"
                    tabIndex={0}
                    onClick={() => openBidReview(load)}
                    onKeyDown={(event) => activateOnEnter(event, () => openBidReview(load))}
                  >
                    <div>
                      <StatusBadge tone={load.risk === 'High' ? 'warn' : 'success'}>{load.fit}</StatusBadge>
                      <h3>{load.cargo}</h3>
                      <p>{load.route}</p>
                      <small>
                        {load.distance} - {load.window}
                      </small>
                    </div>
                    <div>
                      <strong>${load.price.toLocaleString()}</strong>
                      <button
                        className="primary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openBidReview(load);
                        }}
                      >
                        Review Bid
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No unbid loads"
                  detail="New shipper requests will appear here. Submitted offers move into your bids workspace."
                />
              )}
            </div>
          </Panel>

          <OwnerBidReviewPanel
            load={bidTarget}
            draft={bidDraft}
            fleet={fleet}
            busy={bidBusy}
            onChange={updateBidDraft}
            onSubmit={submitOwnerBid}
            onClose={() => setBidTarget(null)}
          />

          <Panel title="Vehicle Readiness" eyebrow="Fleet">
            <div className="add-row">
              <input
                value={draftPlate}
                onChange={(event) => setDraftPlate(event.target.value)}
                placeholder="Plate number"
              />
              <button className="secondary icon-label" type="button" onClick={addTruck}>
                <Plus size={18} />
                <span>Add</span>
              </button>
            </div>
            <div className="shipment-stack">
              {fleet.map((truck) => (
                <article
                  className="shipment-row"
                  key={truck.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTruckReadiness(truck)}
                  onKeyDown={(event) => activateOnEnter(event, () => openTruckReadiness(truck))}
                >
                  <div>
                    <StatusBadge tone={truck.verified ? 'success' : 'warn'}>{truck.documentStatus}</StatusBadge>
                    <h3>{truck.plate}</h3>
                    <p>{truck.name}</p>
                    <small>
                      {truck.routes[0] || 'Route pending'} - {truck.availability}
                    </small>
                  </div>
                  <div className="progress-block">
                    <strong>{truck.routeFit}%</strong>
                    <div className="progress">
                      <span style={{ width: `${truck.routeFit}%` }} />
                    </div>
                    <button
                      className="ghost"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openTruckReadiness(truck);
                      }}
                    >
                      Manage
                    </button>
                    <button
                      className="ghost danger-action"
                      type="button"
                      disabled={busyAction === `remove-truck-${truck.id}`}
                      onClick={async (event) => {
                        event.stopPropagation();
                        if (!window.confirm(`Remove ${truck.plate} from your fleet?`)) return;
                        setBusyAction(`remove-truck-${truck.id}`);
                        try {
                          await api.removeTruck(truck.id);
                          setFleet((current) => current.filter((t) => t.id !== truck.id));
                          notify('Vehicle removed from fleet');
                        } catch (err) {
                          notify(err.message);
                        } finally {
                          setBusyAction('');
                        }
                      }}
                    >
                      {busyAction === `remove-truck-${truck.id}` ? 'Removing...' : 'Remove'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="side-stack">
          <Panel title="Action Queue" eyebrow="Today">
            <div className="action-list">
              {[
                availableLoads[0] ? `Submit bid - ${availableLoads[0].cargo}` : 'Submit bid - Construction steel',
                'Upload insurance - Toyota Hilux',
                'Confirm pickup - Kampala depot'
              ].map((item) => (
                <button className="action-item" type="button" key={item} onClick={() => runOwnerQueue(item)}>
                  {item}
                </button>
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}
