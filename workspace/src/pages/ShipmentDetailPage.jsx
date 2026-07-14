import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBookingCache, useBookingAction } from '../queries/commercial';
import { useSessionBootstrap } from '../queries/session';
import { roleForUser } from '../utils/roles';
import { api } from '../api';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Skeleton from '../components/ui/Skeleton';
import ProgressRing from '../components/ui/ProgressRing';
import BidCard from '../components/domain/BidCard';
import DeliveryProofModal from '../components/domain/DeliveryProofModal';
import DeliveryProofViewer from '../components/domain/DeliveryProofViewer';
import { AlertTriangle, ArrowLeft, Box, ShieldCheck, Truck } from 'lucide-react';
import { money } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';
import Modal from '../components/ui/Modal';

export default function ShipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);

  const { fetchBooking } = useBookingCache();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isProofModalOpen, setIsProofModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueDraft, setIssueDraft] = useState({
    kind: 'support',
    category: 'delivery',
    severity: 'normal',
    message: ''
  });

  const actionMutation = useBookingAction(async (actionFn) => {
    const data = await actionFn();
    return data;
  });

  useEffect(() => {
    fetchBooking(id)
      .then((data) => setShipment(data))
      .catch(() => addToast({ title: 'Error', message: 'Failed to load shipment details', type: 'error' }))
      .finally(() => setLoading(false));
  }, [id, fetchBooking, addToast]);

  if (loading) {
    return (
      <div className="animate-fade-in stack-lg">
        <Skeleton style={{ height: 120 }} />
        <div className="grid-2">
          <Skeleton style={{ height: 400 }} />
          <Skeleton style={{ height: 400 }} />
        </div>
      </div>
    );
  }

  if (!shipment) {
    return (
      <div className="animate-fade-in stack" style={{ alignItems: 'center', paddingTop: '10vh' }}>
        <h2 style={{ fontSize: 'var(--text-xl)' }}>Shipment Not Found</h2>
        <Button variant="secondary" onClick={() => navigate('/app/shipments')}>
          Back to Shipments
        </Button>
      </div>
    );
  }

  const isOwner = role === 'owner';
  const isShipper = role === 'client';

  // Status booleans
  const isPending = shipment.rawStatus === 'pending' || shipment.rawStatus === 'bidding';
  const isConfirmed = shipment.rawStatus === 'confirmed';
  const isInTransit = shipment.rawStatus === 'in_transit';
  const isDelivered = shipment.rawStatus === 'delivered';

  const handleAction = (label, apiCall) => {
    actionMutation.mutate(apiCall, {
      onSuccess: (data) => {
        addToast({ title: 'Success', message: `${label} successful.`, type: 'success' });
        if (data?.booking) setShipment(data.booking);
      },
      onError: (err) => {
        addToast({ title: 'Action Failed', message: err.message, type: 'error' });
      }
    });
  };

  const submitIssue = async () => {
    const message = issueDraft.message.trim();
    if (message.length < 5) {
      addToast({ title: 'Describe the issue', message: 'Please add at least a short explanation.', type: 'warning' });
      return;
    }

    setIsSubmittingIssue(true);
    try {
      await api.reportIssue({
        ...issueDraft,
        message,
        bookingId: shipment.id,
        title: `${issueDraft.category} ${issueDraft.kind}`
      });
      setIssueDraft({ kind: 'support', category: 'delivery', severity: 'normal', message: '' });
      setIsIssueModalOpen(false);
      addToast({ title: 'Issue reported', message: 'Our operations team will review this case.', type: 'success' });
    } catch (error) {
      addToast({ title: 'Report not sent', message: error.message, type: 'error' });
    } finally {
      setIsSubmittingIssue(false);
    }
  };

  return (
    <div className="animate-fade-in stack-lg">
      <div className="row">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/app/shipments')}>
          Back
        </Button>
      </div>

      <div
        className="page-header"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}
      >
        <div>
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <h1 className="page-title">{shipment.id}</h1>
            <Badge variant={isDelivered ? 'success' : isInTransit ? 'info' : 'warning'}>{shipment.status}</Badge>
          </div>
          <p className="text-secondary">
            {shipment.origin} → {shipment.destination}
          </p>
        </div>

        <div className="row" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {role !== 'admin' && (
            <Button variant="secondary" size="sm" icon={AlertTriangle} onClick={() => setIsIssueModalOpen(true)}>
              Report issue
            </Button>
          )}
          {isOwner && isPending && (
            <Button
              variant="primary"
              onClick={() => {
                const amount = prompt('Enter your bid amount in USD:');
                if (amount)
                  handleAction('Bid submitted', () => api.submitBookingBid(shipment.id, { amount: Number(amount) }));
              }}
            >
              Submit Bid
            </Button>
          )}
          {isOwner && isConfirmed && (
            <Button
              variant="primary"
              onClick={() => handleAction('Dispatch started', () => api.bookingDispatch(shipment.id))}
            >
              Start Dispatch
            </Button>
          )}
          {(isOwner || role === 'driver') && isInTransit && (
            <Button variant="primary" onClick={() => setIsProofModalOpen(true)}>
              Confirm Delivery
            </Button>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="stack">
          {/* Progress Card */}
          <Card className="row-between" style={{ padding: 'var(--space-6)' }}>
            <div className="stack-sm">
              <h3 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Transit Progress</h3>
              <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                {isInTransit
                  ? 'Currently on route to destination'
                  : isDelivered
                    ? 'Shipment completed'
                    : 'Waiting for dispatch'}
              </div>
            </div>
            <ProgressRing
              progress={shipment.progress || 0}
              size={80}
              color={isDelivered ? 'var(--success)' : 'var(--brand)'}
            />
          </Card>

          {/* Details Card */}
          <Card className="stack">
            <h3 className="eyebrow" style={{ margin: 0 }}>
              Shipment Details
            </h3>

            <div className="grid-2">
              <div className="stack-sm">
                <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  CARGO
                </div>
                <div className="row" style={{ color: 'var(--ink)' }}>
                  <Box size={16} color="var(--brand)" />
                  <span style={{ fontWeight: 600 }}>{shipment.cargo}</span>
                </div>
                <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                  {shipment.weight} tonnes
                </div>
              </div>

              <div className="stack-sm">
                <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  REQUIREMENTS
                </div>
                <div className="row" style={{ color: 'var(--ink)' }}>
                  <Truck size={16} color="var(--brand)" />
                  <span style={{ fontWeight: 600 }}>{shipment.vehicleType}</span>
                </div>
                <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                  {shipment.requirements}
                </div>
              </div>
            </div>

            <div className="divider" />

            <div className="grid-2">
              <div className="stack-sm">
                <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  PICKUP
                </div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{shipment.origin}</div>
                <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                  {shipment.pickupDate || 'Flexible'}
                </div>
              </div>

              <div className="stack-sm">
                <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                  DROPOFF
                </div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{shipment.destination}</div>
                <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                  {shipment.eta || 'Pending'}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <div className="stack">
          {/* Bids Section for Shippers */}
          {isShipper && isPending && (
            <Card className="stack">
              <h3 className="eyebrow" style={{ margin: 0 }}>
                Carrier Bids
              </h3>
              {!shipment.bids || shipment.bids.length === 0 ? (
                <div className="text-muted" style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
                  Waiting for carriers to place bids on this load.
                </div>
              ) : (
                <div className="stack-sm">
                  {shipment.bids.map((bid) => (
                    <BidCard
                      key={bid.id}
                      bid={bid}
                      onAccept={(id) => handleAction('Bid accepted', () => api.acceptBookingBid(shipment.id, id))}
                    />
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Pricing Summary */}
          {(isConfirmed || isInTransit || isDelivered) && (
            <Card className="stack">
              <h3 className="eyebrow" style={{ margin: 0 }}>
                Payment Summary
              </h3>
              <div className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-secondary">Agreed Price</span>
                <span style={{ fontWeight: 600 }}>{money(shipment.price)}</span>
              </div>
              <div className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-secondary">Escrow Status</span>
                <Badge variant="success" icon={ShieldCheck}>
                  Funded
                </Badge>
              </div>
            </Card>
          )}

          {/* Delivery Proof Viewer */}
          {isDelivered && <DeliveryProofViewer shipmentId={shipment.id} />}
        </div>
      </div>

      <DeliveryProofModal
        isOpen={isProofModalOpen}
        onClose={() => setIsProofModalOpen(false)}
        shipmentId={shipment.id}
      />

      <Modal
        isOpen={isIssueModalOpen}
        onClose={() => setIsIssueModalOpen(false)}
        title="Report an issue"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsIssueModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={isSubmittingIssue} onClick={submitIssue}>
              Send report
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="text-secondary">Reports are linked to this shipment and routed to the operations queue.</p>
          <div className="grid-2">
            <label className="input-group">
              <span className="input-label">Report type</span>
              <select
                className="input-field"
                value={issueDraft.kind}
                onChange={(event) => setIssueDraft({ ...issueDraft, kind: event.target.value })}
              >
                <option value="support">Support request</option>
                <option value="dispute">Dispute</option>
              </select>
            </label>
            <label className="input-group">
              <span className="input-label">Category</span>
              <select
                className="input-field"
                value={issueDraft.category}
                onChange={(event) => setIssueDraft({ ...issueDraft, category: event.target.value })}
              >
                <option value="delivery">Delivery</option>
                <option value="delay">Delay</option>
                <option value="damage">Damage or loss</option>
                <option value="payment">Payment</option>
                <option value="tracking">Tracking</option>
                <option value="conduct">Conduct</option>
                <option value="technical">Technical</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <label className="input-group">
            <span className="input-label">Urgency</span>
            <select
              className="input-field"
              value={issueDraft.severity}
              onChange={(event) => setIssueDraft({ ...issueDraft, severity: event.target.value })}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </label>
          <label className="input-group">
            <span className="input-label">What happened?</span>
            <textarea
              className="input-field"
              rows="5"
              value={issueDraft.message}
              onChange={(event) => setIssueDraft({ ...issueDraft, message: event.target.value })}
              placeholder="Describe what happened, where it happened, and what you need next."
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}
