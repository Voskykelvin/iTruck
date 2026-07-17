import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useBookingCache, useBookingAction, useFleetTrucks } from '../queries/commercial';
import { useSessionBootstrap } from '../queries/session';
import { useDeliveryProofPolicy } from '../queries/operations';
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
import { AlertTriangle, ArrowLeft, Box, Download, ShieldCheck, Star, Truck } from 'lucide-react';
import { money, normalizeBookingShipment, paymentStatusLabel, paymentTone } from '../utils/helpers';
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
  const [isBidModalOpen, setIsBidModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [issueDraft, setIssueDraft] = useState({
    kind: 'support',
    category: 'delivery',
    severity: 'normal',
    message: ''
  });
  const [bidDraft, setBidDraft] = useState({ amount: '', truck: '', message: '', expiresAt: '' });
  const [paymentDraft, setPaymentDraft] = useState({ method: 'card', phone: '' });
  const [paymentMethods, setPaymentMethods] = useState([
    { id: 'card', label: 'Bank card', enabled: true },
    { id: 'mpesa', label: 'M-Pesa', enabled: true },
    { id: 'mtn', label: 'MTN MoMo', enabled: false, unavailableReason: 'Coming later' }
  ]);
  const [reviewDraft, setReviewDraft] = useState({ target: 'owner', score: '5', comment: '' });

  const actionMutation = useBookingAction(async (actionFn) => {
    const data = await actionFn();
    return data;
  });
  const { data: fleet = [] } = useFleetTrucks({ enabled: role === 'owner' });
  const { data: deliveryPolicy } = useDeliveryProofPolicy({ enabled: role === 'client' });

  useEffect(() => {
    fetchBooking(id)
      .then((data) => setShipment(data))
      .catch(() => addToast({ title: 'Error', message: 'Failed to load shipment details', type: 'error' }))
      .finally(() => setLoading(false));
  }, [id, fetchBooking, addToast]);

  useEffect(() => {
    if (role !== 'client') return;
    api
      .paymentMethods()
      .then((data) => {
        if (!Array.isArray(data.methods)) return;
        setPaymentMethods(data.methods);
        const firstEnabled = data.methods.find((method) => method.enabled);
        if (firstEnabled) setPaymentDraft((current) => ({ ...current, method: firstEnabled.id }));
      })
      .catch(() => null);
  }, [role]);

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
  const isDeliveryPending = shipment.rawStatus === 'delivery_pending';
  const isDelivered = shipment.rawStatus === 'delivered';
  const paymentFunded = ['escrowed', 'release_pending', 'released'].includes(shipment.paymentStatus);
  const paymentPending = shipment.paymentStatus === 'pending';
  const resumableCardPayment = paymentPending && shipment.paymentMethod === 'stripe';
  const reviewTargets = isShipper
    ? [
        ...(!shipment.rating?.clientToOwner ? [{ value: 'owner', label: 'Carrier and vehicle' }] : []),
        ...(shipment.driverId && !shipment.rating?.clientToDriver
          ? [{ value: 'driver', label: 'Assigned driver' }]
          : [])
      ]
    : isOwner && !shipment.rating?.ownerToClient
      ? [{ value: 'client', label: 'Shipper' }]
      : [];

  const handleAction = (label, apiCall, options = {}) => {
    actionMutation.mutate(apiCall, {
      onSuccess: (data) => {
        addToast({ title: 'Success', message: `${label} successful.`, type: 'success' });
        if (data?.booking) setShipment(normalizeBookingShipment(data.booking));
        options.onSuccess?.(data);
      },
      onError: (err) => {
        addToast({ title: 'Action Failed', message: err.message, type: 'error' });
      }
    });
  };

  const openBidModal = () => {
    const defaultTruck = fleet.find((truck) => truck.isAvailable !== false && truck.isVerified !== false);
    setBidDraft({ amount: '', truck: defaultTruck?.id || '', message: '', expiresAt: '' });
    setIsBidModalOpen(true);
  };

  const submitBid = () => {
    const amount = Number(bidDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      addToast({ title: 'Enter a valid amount', message: 'Bid amount must be greater than zero.', type: 'warning' });
      return;
    }
    if (bidDraft.expiresAt && new Date(bidDraft.expiresAt) <= new Date()) {
      addToast({ title: 'Choose a future expiry', message: 'Offer expiry must be in the future.', type: 'warning' });
      return;
    }
    handleAction(
      'Bid submitted',
      () =>
        api.submitBookingBid(shipment.id, {
          amount,
          ...(bidDraft.truck ? { truck: bidDraft.truck } : {}),
          ...(bidDraft.message.trim() ? { message: bidDraft.message.trim() } : {}),
          ...(bidDraft.expiresAt ? { expiresAt: new Date(bidDraft.expiresAt).toISOString() } : {})
        }),
      { onSuccess: () => setIsBidModalOpen(false) }
    );
  };

  const submitPayment = () => {
    const amount = Number(shipment.paymentBreakdown?.shipperTotal || shipment.amount);
    const selectedMethod = paymentMethods.find((method) => method.id === paymentDraft.method);
    if (!selectedMethod?.enabled) {
      addToast({ title: 'Method unavailable', message: selectedMethod?.unavailableReason, type: 'warning' });
      return;
    }
    if (paymentDraft.method === 'mpesa' && paymentDraft.phone.trim().length < 8) {
      addToast({
        title: 'Enter a valid phone',
        message: 'Mobile-money funding requires a phone number.',
        type: 'warning'
      });
      return;
    }
    handleAction(
      paymentDraft.method === 'card' ? 'Secure card checkout created' : 'M-Pesa request sent',
      () =>
        paymentDraft.method === 'card'
          ? api.initiateCardCheckout(shipment.id, { amount })
          : api.initiateMobileMoneyEscrow(shipment.id, {
              amount,
              method: paymentDraft.method,
              phone: paymentDraft.phone.trim()
            }),
      {
        onSuccess: (data) => {
          setIsPaymentModalOpen(false);
          if (data?.checkoutUrl) window.location.assign(data.checkoutUrl);
        }
      }
    );
  };

  const submitReview = () => {
    handleAction(
      'Review submitted',
      () =>
        api.rateBooking(shipment.id, {
          target: reviewDraft.target,
          score: Number(reviewDraft.score),
          ...(reviewDraft.comment.trim() ? { comment: reviewDraft.comment.trim() } : {})
        }),
      { onSuccess: () => setIsReviewModalOpen(false) }
    );
  };

  const releasePayment = () => {
    handleAction('Payment released', () => api.releasePayment(shipment.id));
  };

  const openReview = () => {
    setReviewDraft({ target: reviewTargets[0]?.value || 'owner', score: '5', comment: '' });
    setIsReviewModalOpen(true);
  };

  const downloadDocument = async (type, label) => {
    try {
      await api.downloadDocument(type, shipment.id);
      addToast({ title: `${label} ready`, message: 'Your download has started.', type: 'success' });
    } catch (error) {
      addToast({ title: 'Download failed', message: error.message, type: 'error' });
    }
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
            <Button variant="primary" onClick={openBidModal}>
              Submit Bid
            </Button>
          )}
          {isOwner && isConfirmed && (
            <Button
              variant="primary"
              disabled={!paymentFunded}
              title={!paymentFunded ? 'The shipper must fund escrow before dispatch can start.' : undefined}
              onClick={() =>
                handleAction('Dispatch started', () => api.updateBookingStatus(shipment.id, { status: 'in_transit' }))
              }
            >
              {paymentFunded ? 'Start Dispatch' : 'Awaiting Escrow'}
            </Button>
          )}
          {isShipper && isConfirmed && !paymentFunded && (
            <Button
              variant="primary"
              disabled={paymentPending && !resumableCardPayment}
              onClick={() => setIsPaymentModalOpen(true)}
            >
              {resumableCardPayment ? 'Resume Secure Payment' : paymentPending ? 'Payment Pending' : 'Pay Securely'}
            </Button>
          )}
          {isShipper && (isDeliveryPending || (isInTransit && deliveryPolicy?.directShipperConfirmation)) && (
            <Button
              variant="primary"
              onClick={() => handleAction('Delivery confirmed', () => api.confirmDelivery(shipment.id))}
            >
              Confirm Receipt
            </Button>
          )}
          {(isOwner || role === 'driver') && isInTransit && (
            <Button variant="primary" onClick={() => setIsProofModalOpen(true)}>
              Confirm Delivery
            </Button>
          )}
          {isDelivered && reviewTargets.length > 0 && (
            <Button variant="primary" icon={Star} onClick={openReview}>
              Leave a Review
            </Button>
          )}
          {isShipper && isDelivered && shipment.paymentStatus === 'escrowed' && (
            <Button variant="primary" onClick={releasePayment} loading={actionMutation.isPending}>
              Release Payment
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
                      onAccept={(id) =>
                        handleAction('Bid accepted', () => api.acceptBookingBid(shipment.id, id), {
                          removeFromOpen: true
                        })
                      }
                    />
                  ))}
                </div>
              )}
            </Card>
          )}

          {!isPending && shipment.bids?.some((bid) => bid.status === 'accepted') && (
            <Card className="stack">
              <h3 className="eyebrow" style={{ margin: 0 }}>
                Accepted Offer
              </h3>
              <BidCard bid={shipment.bids.find((bid) => bid.status === 'accepted')} isOwner />
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
                <span style={{ fontWeight: 600 }}>
                  {money(shipment.paymentBreakdown?.carrierAmount || shipment.amount)}
                </span>
              </div>
              <div className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-secondary">iTruck Platform Fee</span>
                <span style={{ fontWeight: 600 }}>{money(shipment.paymentBreakdown?.platformFee || 0)}</span>
              </div>
              <div className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-secondary">Total</span>
                <span style={{ fontWeight: 700 }}>
                  {money(shipment.paymentBreakdown?.shipperTotal || shipment.amount)}
                </span>
              </div>
              <div className="row-between" style={{ fontSize: 'var(--text-sm)' }}>
                <span className="text-secondary">Escrow Status</span>
                <Badge
                  variant={
                    paymentTone(shipment.paymentStatus) === 'warn' ? 'warning' : paymentTone(shipment.paymentStatus)
                  }
                  icon={ShieldCheck}
                >
                  {paymentStatusLabel(shipment.paymentStatus)}
                </Badge>
              </div>
            </Card>
          )}

          {/* Delivery Proof Viewer */}
          {isDelivered && <DeliveryProofViewer shipmentId={shipment.id} />}
          {isDelivered && (
            <Card className="stack">
              <h3 className="eyebrow" style={{ margin: 0 }}>
                Post-delivery Documents
              </h3>
              <p className="text-secondary" style={{ margin: 0 }}>
                Download the final commercial and delivery records for this shipment.
              </p>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => downloadDocument('invoice', 'Invoice')}
                >
                  Invoice
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => downloadDocument('pod', 'Proof of Delivery')}
                >
                  Proof of Delivery
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => downloadDocument('receiver-confirmation', 'Receiver Confirmation')}
                >
                  Receiver Confirmation
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>

      <DeliveryProofModal
        isOpen={isProofModalOpen}
        onClose={() => setIsProofModalOpen(false)}
        shipmentId={shipment.id}
      />

      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Fund shipment escrow"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsPaymentModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={actionMutation.isPending} onClick={submitPayment}>
              {paymentDraft.method === 'card' ? 'Continue to Secure Checkout' : 'Send M-Pesa Prompt'}
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="text-secondary">
            Dispatch becomes available after the full shipment total is safely held in escrow.
          </p>
          <div className="glass-panel stack-sm" style={{ padding: 'var(--space-4)' }}>
            <div className="row-between">
              <span>Carrier amount</span>
              <strong>{money(shipment.paymentBreakdown?.carrierAmount || shipment.amount)}</strong>
            </div>
            <div className="row-between">
              <span>iTruck platform fee</span>
              <strong>{money(shipment.paymentBreakdown?.platformFee || 0)}</strong>
            </div>
            <div className="row-between">
              <span>Total to fund</span>
              <strong>{money(shipment.paymentBreakdown?.shipperTotal || shipment.amount)}</strong>
            </div>
          </div>
          <label className="input-group">
            <span className="input-label">Payment method</span>
            <select
              className="input-field"
              value={paymentDraft.method}
              onChange={(event) => setPaymentDraft({ ...paymentDraft, method: event.target.value })}
            >
              {paymentMethods.map((method) => (
                <option key={method.id} value={method.id} disabled={!method.enabled}>
                  {method.label}
                  {method.enabled ? '' : ' — unavailable'}
                </option>
              ))}
            </select>
            {paymentMethods.find((method) => method.id === paymentDraft.method)?.description && (
              <span className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                {paymentMethods.find((method) => method.id === paymentDraft.method).description}
              </span>
            )}
          </label>
          {paymentDraft.method === 'mpesa' && (
            <label className="input-group">
              <span className="input-label">Mobile-money phone</span>
              <input
                className="input-field"
                type="tel"
                value={paymentDraft.phone}
                onChange={(event) => setPaymentDraft({ ...paymentDraft, phone: event.target.value })}
                placeholder="e.g. +254712345678"
              />
            </label>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        title="Review completed shipment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsReviewModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={actionMutation.isPending} onClick={submitReview}>
              Submit Review
            </Button>
          </>
        }
      >
        <div className="stack">
          {reviewTargets.length > 1 && (
            <label className="input-group">
              <span className="input-label">Review</span>
              <select
                className="input-field"
                value={reviewDraft.target}
                onChange={(event) => setReviewDraft({ ...reviewDraft, target: event.target.value })}
              >
                {reviewTargets.map((target) => (
                  <option key={target.value} value={target.value}>
                    {target.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="input-group">
            <span className="input-label">Rating</span>
            <select
              className="input-field"
              value={reviewDraft.score}
              onChange={(event) => setReviewDraft({ ...reviewDraft, score: event.target.value })}
            >
              <option value="5">5 — Excellent</option>
              <option value="4">4 — Good</option>
              <option value="3">3 — Acceptable</option>
              <option value="2">2 — Needs improvement</option>
              <option value="1">1 — Poor</option>
            </select>
          </label>
          <label className="input-group">
            <span className="input-label">Comment (optional)</span>
            <textarea
              className="input-field"
              rows="4"
              maxLength="1000"
              value={reviewDraft.comment}
              onChange={(event) => setReviewDraft({ ...reviewDraft, comment: event.target.value })}
              placeholder="Share useful feedback about this completed shipment."
            />
          </label>
        </div>
      </Modal>

      <Modal
        isOpen={isBidModalOpen}
        onClose={() => setIsBidModalOpen(false)}
        title="Submit a bid"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsBidModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={actionMutation.isPending} onClick={submitBid}>
              Submit Bid
            </Button>
          </>
        }
      >
        <div className="stack">
          <p className="text-secondary">
            Review {shipment.origin} to {shipment.destination}, then choose the vehicle and commercial terms.
          </p>
          <label className="input-group">
            <span className="input-label">Bid amount (KES)</span>
            <input
              className="input-field"
              type="number"
              min="0.01"
              step="0.01"
              required
              value={bidDraft.amount}
              onChange={(event) => setBidDraft({ ...bidDraft, amount: event.target.value })}
            />
          </label>
          <label className="input-group">
            <span className="input-label">Vehicle</span>
            <select
              className="input-field"
              value={bidDraft.truck}
              onChange={(event) => setBidDraft({ ...bidDraft, truck: event.target.value })}
            >
              <option value="">Choose a vehicle</option>
              {fleet.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {[truck.make, truck.model, truck.plate].filter(Boolean).join(' · ') || truck.type}
                </option>
              ))}
            </select>
          </label>
          <label className="input-group">
            <span className="input-label">Message to shipper</span>
            <textarea
              className="input-field"
              rows="4"
              maxLength="1000"
              placeholder="Share availability, pickup timing, or handling details."
              value={bidDraft.message}
              onChange={(event) => setBidDraft({ ...bidDraft, message: event.target.value })}
            />
          </label>
          <label className="input-group">
            <span className="input-label">Offer expires (optional)</span>
            <input
              className="input-field"
              type="datetime-local"
              value={bidDraft.expiresAt}
              onChange={(event) => setBidDraft({ ...bidDraft, expiresAt: event.target.value })}
            />
          </label>
          {bidDraft.expiresAt && new Date(bidDraft.expiresAt) <= new Date() && (
            <div className="input-message error">Expiry must be in the future.</div>
          )}
        </div>
      </Modal>

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
