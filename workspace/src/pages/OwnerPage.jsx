import { useState, useMemo } from 'react';
import { Wallet, Truck, Gauge, ShieldCheck, Plus } from 'lucide-react';
import { api } from '../api.js';
import MetricCard from '../components/MetricCard.jsx';
import Panel from '../components/Panel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import OwnerBidReviewPanel from '../components/OwnerBidReviewPanel.jsx';
import DriverOperationsPanel from '../components/DriverOperationsPanel.jsx';
import AsyncState from '../components/AsyncState.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import {
  useBookingAction,
  useBookings,
  useCreateFleetTruck,
  useFleetTrucks,
  useOpenBookings,
  useRemoveFleetTruck
} from '../queries/commercial.js';
import { useWallet } from '../queries/operations.js';
import {
  bidDraftForLoad,
  uniqueBidRecords,
  ownerBidRecordsFromShipments,
  activateOnEnter,
  money,
  bidPayloadForDraft,
  navigate
} from '../utils/helpers.js';

export default function OwnerPage({ notify, user }) {
  const [draftPlate, setDraftPlate] = useState('');
  const [bidTarget, setBidTarget] = useState(null);
  const [bidDraft, setBidDraft] = useState(() => bidDraftForLoad(null));
  const [removalTarget, setRemovalTarget] = useState(null);
  const fleetQuery = useFleetTrucks();
  const loadsQuery = useOpenBookings();
  const bookingsQuery = useBookings();
  const walletQuery = useWallet();
  const createTruck = useCreateFleetTruck();
  const removeTruck = useRemoveFleetTruck();
  const submitBid = useBookingAction(({ bookingId, payload }) => api.submitBookingBid(bookingId, payload));
  const updateStatus = useBookingAction(({ bookingId, payload }) => api.updateBookingStatus(bookingId, payload));
  const fleet = fleetQuery.data || [];
  const loads = useMemo(() => loadsQuery.data || [], [loadsQuery.data]);
  const ownerBookings = useMemo(() => bookingsQuery.data || [], [bookingsQuery.data]);

  const ownerBidRecords = useMemo(
    () => uniqueBidRecords(ownerBidRecordsFromShipments(ownerBookings, user)),
    [ownerBookings, user]
  );
  const ownerBidLoadIds = useMemo(
    () => new Set(ownerBidRecords.map((record) => String(record.bookingId)).filter(Boolean)),
    [ownerBidRecords]
  );
  const availableLoads = useMemo(
    () => loads.filter((load) => !load.bidSubmitted && !ownerBidLoadIds.has(String(load.id || load.bookingId))),
    [loads, ownerBidLoadIds]
  );

  async function confirmTruckRemoval() {
    if (!removalTarget) return;
    try {
      await removeTruck.mutateAsync(removalTarget.id);
      notify('Vehicle removed from fleet');
      setRemovalTarget(null);
    } catch (err) {
      notify(err.message);
    }
  }

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
      await createTruck.mutateAsync(payload);
      setDraftPlate('');
      notify('Vehicle sent to admin review');
    } catch (err) {
      notify(err.message || 'Vehicle was not saved. Try again.');
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
    try {
      if (!bidTarget.id) throw new Error('Bid needs a synced booking');
      await submitBid.mutateAsync({ bookingId: bidTarget.id, payload, removeFromOpen: true });
      notify(`Bid submitted for ${bidTarget.route}. Moved to My Bids.`);
      setBidTarget(null);
    } catch (err) {
      notify(err.message || 'Bid was not submitted. Try again.');
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
      await updateStatus.mutateAsync({
        bookingId: target.bookingId,
        payload: {
          status: 'in_transit',
          location: { lat: -1.2921, lng: 36.8219, speed: 0, heading: 0 }
        }
      });
      notify(`Pickup started for ${target.id}`);
      navigate(`/app/tracking?shipment=${encodeURIComponent(target.id)}`);
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
        <MetricCard
          icon={Wallet}
          label="Wallet Balance"
          value={walletQuery.isError ? 'Unavailable' : money(walletQuery.data || 0)}
          detail={walletQuery.isPending ? 'Loading balance' : 'Available for payout'}
        />
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
            {loadsQuery.isError ? (
              <AsyncState
                compact
                title="Loads could not be loaded"
                detail={loadsQuery.error?.message}
                onRetry={() => loadsQuery.refetch()}
              />
            ) : null}
            <div className="shipment-stack">
              {loadsQuery.isPending ? (
                <AsyncState compact title="Loading available loads..." />
              ) : loadsQuery.isError ? null : availableLoads.length ? (
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
            busy={submitBid.isPending}
            onChange={updateBidDraft}
            onSubmit={submitOwnerBid}
            onClose={() => setBidTarget(null)}
          />

          <Panel title="Vehicle Readiness" eyebrow="Fleet">
            {fleetQuery.isError ? (
              <AsyncState
                compact
                title="Fleet could not be loaded"
                detail={fleetQuery.error?.message}
                onRetry={() => fleetQuery.refetch()}
              />
            ) : null}
            <div className="add-row">
              <input
                value={draftPlate}
                onChange={(event) => setDraftPlate(event.target.value)}
                placeholder="Plate number"
              />
              <button
                className="secondary icon-label"
                type="button"
                disabled={createTruck.isPending}
                onClick={addTruck}
              >
                <Plus size={18} />
                <span>{createTruck.isPending ? 'Adding...' : 'Add'}</span>
              </button>
            </div>
            <div className="shipment-stack">
              {fleetQuery.isPending ? (
                <AsyncState compact title="Loading fleet..." />
              ) : fleetQuery.isError ? null : fleet.length ? (
                fleet.map((truck) => (
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
                        disabled={removeTruck.isPending && String(removeTruck.variables) === String(truck.id)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setRemovalTarget(truck);
                        }}
                      >
                        {removeTruck.isPending && String(removeTruck.variables) === String(truck.id)
                          ? 'Removing...'
                          : 'Remove'}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No vehicles registered"
                  detail="Add a plate number to begin vehicle verification and fleet setup."
                />
              )}
            </div>
          </Panel>
          <DriverOperationsPanel fleet={fleet} notify={notify} />
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
      <ConfirmDialog
        open={Boolean(removalTarget)}
        title="Remove vehicle?"
        description={`${removalTarget?.plate || 'This vehicle'} will be removed from your fleet. This does not delete completed shipment history.`}
        confirmLabel="Remove vehicle"
        busy={removeTruck.isPending}
        onCancel={() => setRemovalTarget(null)}
        onConfirm={confirmTruckRemoval}
      />
    </div>
  );
}
