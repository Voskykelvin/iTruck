import { useState, useEffect, useRef } from 'react';
import { Plus, Map, PackageCheck, Truck, AlertTriangle, Wallet, FileText } from 'lucide-react';
import { api } from '../api.js';
import { workspaceShipments } from '../data.js';
import StatusBadge from '../components/StatusBadge.jsx';
import MetricCard from '../components/MetricCard.jsx';
import Panel from '../components/Panel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import BidComparisonTable from '../components/BidComparisonTable.jsx';
import {
  normalizeBookingShipment,
  money,
  navigate,
  activateOnEnter,
  normalizeBookingDocumentType,
  documentUploadAccept,
  documentActions
} from '../utils/helpers.js';

export default function ShipperPage({ notify, user }) {
  const [shipments, setShipments] = useState(workspaceShipments);
  const [walletBalance, setWalletBalance] = useState(0);
  const [bidReview, setBidReview] = useState(null);
  const [documentReview, setDocumentReview] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const cargoInputRef = useRef(null);
  const cargoUploadRef = useRef(null);

  useEffect(() => {
    api
      .listBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setShipments(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => setShipments(workspaceShipments));

    api
      .wallet()
      .then((data) => Number.isFinite(Number(data.balance)) && setWalletBalance(Number(data.balance)))
      .catch(() => {});
  }, []);

  const activeCount = shipments.filter((item) => !['delivered', 'cancelled'].includes(item.rawStatus)).length;
  const inTransitCount = shipments.filter((item) => item.rawStatus === 'in_transit').length;
  const openRequests = shipments.filter((item) => ['pending', 'bidding'].includes(item.rawStatus));

  function shipmentWithBooking(preferred) {
    return preferred?.bookingId ? preferred : shipments.find((item) => item.bookingId) || null;
  }

  async function openBidReview(item) {
    const target = item || openRequests[0] || shipments.find((shipment) => shipment.rawStatus === 'bidding');

    if (!target?.bookingId) {
      setBidReview({
        id: 'No synced request',
        route: 'Create or sync a booking before comparing carrier bids.',
        bids: []
      });
      notify('No synced booking is ready for bid review');
      return;
    }

    setBusyAction('bid-review');
    try {
      const data = await api.getBooking(target.bookingId);
      const review = normalizeBookingShipment(data.booking || target);
      setBidReview(review);
      notify(`Loaded ${review.bids.length} carrier bid${review.bids.length === 1 ? '' : 's'}`);
    } catch (err) {
      if (import.meta.env.NODE_ENV === 'development') {
        console.error('Failed to fetch booking for bid review:', err);
      }
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function awardBid(bid) {
    if (!bidReview?.bookingId || !bid?.id) return;

    setBusyAction(`award-${bid.id}`);
    try {
      const data = await api.acceptBookingBid(bidReview.bookingId, bid.id);
      const updated = normalizeBookingShipment(data.booking || {});
      setBidReview(updated);
      setShipments((current) => current.map((item) => (item.bookingId === updated.bookingId ? updated : item)));
      notify(`Awarded ${bid.ownerName}`);
    } catch (err) {
      if (import.meta.env.NODE_ENV === 'development') {
        console.error('Failed to award bid:', err);
      }
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  function openDocumentWorkbench(focusLabel = 'Waybill', preferred) {
    const target = shipmentWithBooking(preferred);
    if (!target) {
      navigate('/app/tracking');
      notify('Open a synced booking before managing documents');
      return;
    }

    setDocumentReview({
      target,
      focusLabel,
      status: `${focusLabel} controls are ready for ${target.id}`
    });
  }

  async function downloadShipmentDocument(definition, preferred, nextFocus = definition.label) {
    const target = shipmentWithBooking(preferred);
    if (!target) {
      navigate('/app/tracking');
      notify('Open a synced booking before generating shipment documents');
      return;
    }

    setBusyAction(`document-${definition.type}`);
    try {
      await api.downloadDocument(definition.type, target.bookingId);
      setDocumentReview({
        target,
        focusLabel: nextFocus,
        status: `${definition.label} downloaded for ${target.id}`
      });
      notify(`${definition.label} downloaded for ${target.id}`);
    } catch (err) {
      if (import.meta.env.NODE_ENV === 'development') {
        console.error(`Failed to download ${definition.label} document:`, err);
      }
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function openWaybillAndPhotos() {
    const target = shipmentWithBooking(shipments[0]);
    if (!target) {
      navigate('/app/tracking');
      notify('Open tracking after a synced booking to review documents');
      return;
    }

    try {
      openDocumentWorkbench('Cargo photos', target);
      await downloadShipmentDocument(documentActions[0], target, 'Cargo photos');
    } catch (err) {
      if (import.meta.env.NODE_ENV === 'development') {
        console.error('Failed to open waybill and photos:', err);
      }
      notify('Error loading waybill and photos');
    }
  }

  function handleShipmentDocument(definition, preferred) {
    const target = shipmentWithBooking(preferred || documentReview?.target);
    if (!target) {
      navigate('/app/tracking');
      notify('Open a synced booking before managing documents');
      return;
    }

    if (definition.mode === 'upload') {
      cargoUploadRef.current = { target, definition };
      setDocumentReview({
        target,
        focusLabel: definition.label,
        status: `Choose cargo photos to upload for ${target.id}`
      });
      cargoInputRef.current?.click();
      return;
    }

    downloadShipmentDocument(definition, target);
  }

  async function uploadShipmentCargoPhotos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const target = cargoUploadRef.current?.target || shipmentWithBooking(documentReview?.target);
    if (!target) return;

    const definition = cargoUploadRef.current?.definition || documentActions[1];
    const documentType = normalizeBookingDocumentType(definition.type);
    setBusyAction(`document-${documentType}`);
    try {
      const data = await api.uploadBookingDocument(target.bookingId, documentType, files);
      if (data.booking) {
        const updated = normalizeBookingShipment(data.booking);
        setShipments((current) => current.map((item) => (item.bookingId === updated.bookingId ? updated : item)));
      }
      setDocumentReview({
        target,
        focusLabel: definition.label,
        status: `${files.length} ${definition.label.toLowerCase()} file${files.length === 1 ? '' : 's'} uploaded for ${
          target.id
        }`
      });
      notify(`${definition.label} uploaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function cancelBooking(item) {
    if (!item?.bookingId) {
      notify('Cannot cancel: booking not synced');
      return;
    }
    if (!window.confirm(`Cancel shipment ${item.id}?`)) return;
    setBusyAction(`cancel-${item.bookingId}`);
    try {
      await api.updateBookingStatus(item.bookingId, { status: 'cancelled' });
      setShipments((current) =>
        current.map((s) => (s.bookingId === item.bookingId ? { ...s, rawStatus: 'cancelled', status: 'Cancelled' } : s))
      );
      notify(`Shipment ${item.id} cancelled`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  const bidQueueTarget = openRequests[0] || shipments.find((shipment) => shipment.rawStatus === 'bidding');
  const actionQueue = [
    {
      label: bidQueueTarget ? `Compare bids - ${bidQueueTarget.route}` : 'Compare carrier bids',
      run: () => openBidReview(bidQueueTarget)
    },
    {
      label: 'Confirm waybill and cargo photos',
      run: openWaybillAndPhotos
    },
    {
      label: 'Release payment after POD',
      run: () => {
        const delivered = shipments.find((item) => item.rawStatus === 'delivered');
        if (user?.role === 'admin' && delivered?.bookingId) {
          api
            .releasePayment(delivered.bookingId)
            .then(() => notify(`Payment released for ${delivered.id}`))
            .catch((err) => notify(err.message));
          return;
        }
        navigate('/app/admin');
        notify('Payment release requires admin approval');
      }
    }
  ];
  const readinessDocs = documentActions;

  return (
    <div className="page-grid">
      <input
        ref={cargoInputRef}
        type="file"
        accept={documentUploadAccept}
        multiple
        onChange={uploadShipmentCargoPhotos}
        style={{ display: 'none' }}
      />
      <section className="intro-band">
        <div>
          <p className="eyebrow">Client Workspace</p>
          <h2>Shipments that need your attention.</h2>
          <p>
            Compare bids, review documents, release payments, and keep active routes visible without jumping across
            separate tools.
          </p>
          <div className="button-row">
            <button className="primary icon-label" type="button" onClick={() => navigate('/app/book')}>
              <Plus size={18} />
              <span>New Booking</span>
            </button>
            <button className="secondary icon-label" type="button" onClick={() => navigate('/app/tracking')}>
              <Map size={18} />
              <span>Track Cargo</span>
            </button>
          </div>
        </div>
        <div className="command-summary">
          <StatusBadge tone="success">{activeCount} active</StatusBadge>
          <strong>{shipments[0] ? `Next update: ${shipments[0].eta}` : 'No live shipment updates yet'}</strong>
          <span>
            {shipments[0] ? `${shipments[0].route} - ${shipments[0].id}` : 'Create a booking to start tracking'}
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard icon={PackageCheck} label="Total Shipments" value={shipments.length} detail="Booking records" />
        <MetricCard icon={Truck} label="In Transit" value={inTransitCount} detail="Live shipment status" />
        <MetricCard
          icon={AlertTriangle}
          label="Awaiting Action"
          value={openRequests.length}
          detail="Bids, docs, payment"
        />
        <MetricCard icon={Wallet} label="Wallet" value={money(walletBalance)} detail="Escrow and payment balance" />
      </section>

      <section className="workspace-layout">
        <div className="stack">
          <Panel
            title="Shipment Command"
            eyebrow="Live Work"
            action="View map"
            onAction={() => navigate('/app/tracking')}
          >
            <div className="shipment-stack">
              {shipments.length ? (
                shipments.map((item) => (
                  <article
                    className="shipment-row"
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/app/tracking?shipment=${item.id}`)}
                    onKeyDown={(event) => activateOnEnter(event, () => navigate(`/app/tracking?shipment=${item.id}`))}
                  >
                    <div>
                      <StatusBadge
                        tone={
                          item.status === 'Delivered' ? 'success' : item.status === 'Bids open' ? 'warn' : 'default'
                        }
                      >
                        {item.status}
                      </StatusBadge>
                      <h3>{item.id}</h3>
                      <p>{item.route}</p>
                      <small>
                        {item.cargo} - {item.eta}
                      </small>
                    </div>
                    <div className="progress-block">
                      <strong>{item.progress}%</strong>
                      <div className="progress">
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                      <button
                        className="ghost"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/app/tracking?shipment=${item.id}`);
                        }}
                      >
                        Open
                      </button>
                      {!['delivered', 'cancelled'].includes(item.rawStatus) && item.bookingId ? (
                        <button
                          className="ghost"
                          type="button"
                          disabled={busyAction === `cancel-${item.bookingId}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            cancelBooking(item);
                          }}
                        >
                          {busyAction === `cancel-${item.bookingId}` ? 'Cancelling...' : 'Cancel'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState title="No live shipments yet" detail="Create a booking to populate this dashboard." />
              )}
            </div>
          </Panel>

          <Panel title="Open Requests" eyebrow="Quotes" action="Create request" onAction={() => navigate('/app/book')}>
            <div className="cards-grid">
              {openRequests.length ? (
                openRequests.map((item) => (
                  <article className="quote-card" key={item.id}>
                    <StatusBadge>{item.status}</StatusBadge>
                    <h3>{item.route}</h3>
                    <p>{item.vehicle}</p>
                    <strong>{item.payment}</strong>
                    <button className="secondary" type="button" onClick={() => openBidReview(item)}>
                      Review Bids
                    </button>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No open quote requests"
                  detail="New booking requests will appear here after shippers create them."
                />
              )}
            </div>
          </Panel>

          {bidReview ? (
            <Panel title="Bid Review" eyebrow="Carrier Awards" action="Close" onAction={() => setBidReview(null)}>
              <div className="facts-grid">
                <span>Request</span>
                <strong>{bidReview.id}</strong>
                <span>Route</span>
                <strong>{bidReview.route}</strong>
                <span>Status</span>
                <strong>{bidReview.status || 'Reviewing'}</strong>
              </div>
              {busyAction === 'bid-review' ? (
                <EmptyState title="Loading carrier bids" detail="Reading the live booking record from the API." />
              ) : (
                <BidComparisonTable
                  bids={bidReview.bids || []}
                  onAward={awardBid}
                  busyId={busyAction.startsWith('award-') ? busyAction.replace('award-', '') : ''}
                />
              )}
              <div className="button-row">
                <button className="secondary" type="button" onClick={() => navigate('/app/marketplace')}>
                  Open Marketplace
                </button>
                <button className="ghost" type="button" onClick={() => openBidReview(bidReview)}>
                  Refresh Bids
                </button>
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="side-stack">
          <Panel title="Action Queue" eyebrow="Today">
            <div className="action-list">
              {actionQueue.map((item) => (
                <button
                  className="action-item"
                  type="button"
                  key={item.label}
                  disabled={Boolean(busyAction)}
                  onClick={item.run}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Documents" eyebrow="Readiness">
            <div className="doc-list">
              {readinessDocs.map((definition) => (
                <button
                  type="button"
                  key={definition.label}
                  disabled={busyAction === `document-${definition.type}`}
                  onClick={() => handleShipmentDocument(definition)}
                >
                  {busyAction === `document-${definition.type}` ? 'Working...' : definition.label}
                </button>
              ))}
            </div>
          </Panel>
          {documentReview ? (
            <Panel
              title="Document Workbench"
              eyebrow={documentReview.target?.id || 'Shipment Docs'}
              action="Close"
              onAction={() => setDocumentReview(null)}
            >
              <div className="verification-card">
                <FileText size={28} />
                <strong>{documentReview.focusLabel}</strong>
                <span>{documentReview.status}</span>
              </div>
              <div className="doc-list compact">
                {documentActions.map((definition) => (
                  <button
                    type="button"
                    key={definition.label}
                    disabled={Boolean(busyAction)}
                    onClick={() => handleShipmentDocument(definition, documentReview.target)}
                  >
                    {definition.label}
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
        </aside>
      </section>
    </div>
  );
}
