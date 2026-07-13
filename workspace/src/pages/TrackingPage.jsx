import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  MapPin,
  Radio,
  StopCircle,
  PlayCircle,
  RotateCw,
  ClipboardCheck,
  PackageCheck,
  ShieldCheck,
  MessageSquare,
  Navigation,
  Phone,
  AlertTriangle,
  Send
} from 'lucide-react';
import io from 'socket.io-client';
import { api } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import AsyncState from '../components/AsyncState.jsx';
import DocumentSlotButton from '../components/DocumentSlotButton.jsx';
import ChatBubble from '../components/ChatBubble.jsx';
import ReportIssueModal from '../components/modals/ReportIssueModal.jsx';
import DeliveryProofModal from '../components/modals/DeliveryProofModal.jsx';
import ProductionRouteMap from '../components/ProductionRouteMap.jsx';
import ShipmentTimeline from '../components/ShipmentTimeline.jsx';
import useAnimatedTrackingPoint from '../hooks/useAnimatedTrackingPoint.js';
import { useBookingAction, useBookingCache, useBookings } from '../queries/commercial.js';
import {
  useCaseAction,
  useConversationCache,
  useMessages,
  useSendMessage,
  useShipmentCases
} from '../queries/conversations.js';
import { roleForUser } from '../utils/roles.js';
import {
  userIdFor,
  latestTrackingPoint,
  formatCoordinatePair,
  formatTrackingTime,
  flushTelemetryQueue,
  queueTelemetryPoint,
  normalizeBrowserPosition,
  shouldSendTelemetry,
  hasDestinationCoordinates,
  deliveryProofDocument,
  documentStatusMeta,
  hasReceiverGradeProof,
  statusLabel,
  upsertGeneratedBookingDocument,
  userDisplayName,
  copyToClipboard,
  documentUploadAccept,
  shipmentDocumentStatus,
  navigate
} from '../utils/helpers.js';

const EMPTY_SHIPMENTS = [];

function LivePositionCard({ shipment }) {
  const targetPoint = latestTrackingPoint(shipment);
  const animatedPoint = useAnimatedTrackingPoint(targetPoint);
  const hasPoint = Boolean(animatedPoint);

  return (
    <div className="live-position-card">
      <div>
        <span>
          <MapPin size={16} />
          Current position
        </span>
        <strong>{hasPoint ? formatCoordinatePair(animatedPoint) : shipment.position}</strong>
      </div>
      <div className="live-position-grid">
        <span>Speed</span>
        <strong>
          {Number.isFinite(Number(animatedPoint?.speed))
            ? `${Number(animatedPoint.speed).toFixed(1)} km/h`
            : shipment.speed}
        </strong>
        <span>Heading</span>
        <strong>
          {Number.isFinite(Number(animatedPoint?.heading))
            ? `${Math.round(Number(animatedPoint.heading))} deg`
            : 'Pending'}
        </strong>
        <span>Accuracy</span>
        <strong>
          {Number.isFinite(Number(animatedPoint?.accuracy))
            ? `${Math.round(Number(animatedPoint.accuracy))} m`
            : 'Pending'}
        </strong>
        <span>Updated</span>
        <strong>{hasPoint ? formatTrackingTime(animatedPoint) : 'No GPS yet'}</strong>
      </div>
    </div>
  );
}

function DriverLiveTracker({ shipment, notify, onBookingUpdate }) {
  const [isTracking, setIsTracking] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Idle');
  const [lastPoint, setLastPoint] = useState(() => latestTrackingPoint(shipment));
  const [queuedCount, setQueuedCount] = useState(0);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  const lastPointRef = useRef(latestTrackingPoint(shipment));
  const lastSentAtRef = useRef(0);
  const offlineNoticeRef = useRef(false);
  const bookingId = shipment?.bookingId;
  const canTrack = Boolean(bookingId && ['confirmed', 'in_transit', 'delivery_pending'].includes(shipment?.rawStatus));

  const applyBooking = useCallback(
    (booking) => {
      if (booking) onBookingUpdate(booking);
    },
    [onBookingUpdate]
  );

  const requestWakeLock = useCallback(async () => {
    if (!navigator.wakeLock?.request || wakeLockRef.current) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch (_err) {
      wakeLockRef.current = null;
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    const current = wakeLockRef.current;
    wakeLockRef.current = null;
    current?.release?.().catch(() => {});
  }, []);

  const flushQueued = useCallback(
    async ({ quiet = false } = {}) => {
      if (!bookingId) return;
      try {
        const result = await flushTelemetryQueue(bookingId, async (updates) => {
          const data = await api.sendTrackingBatch(bookingId, updates);
          applyBooking(data.booking);
          return data;
        });
        if (result.sent) {
          setQueuedCount(0);
          setSyncStatus(`Synced ${result.sent} queued point${result.sent === 1 ? '' : 's'}`);
          offlineNoticeRef.current = false;
          if (!quiet) notify(`Synced ${result.sent} tracking point${result.sent === 1 ? '' : 's'}`);
        }
      } catch (err) {
        setSyncStatus('Queue waiting');
        if (!quiet) notify(err.message || 'Tracking queue is waiting for sync');
      }
    },
    [applyBooking, bookingId, notify]
  );

  const sendOrQueue = useCallback(
    async (point) => {
      if (!bookingId) return;
      lastSentAtRef.current = Date.now();
      setLastPoint(point);
      setSyncStatus('Sending');

      try {
        const data = await api.sendTrackingUpdate(bookingId, point);
        applyBooking(data.booking);
        setSyncStatus('Live');
        offlineNoticeRef.current = false;
        await flushQueued({ quiet: true });
      } catch (err) {
        const message = err.message || '';
        const rejected = /forbidden|only accepted|latitude|longitude|validation|not found/i.test(message);
        if (rejected) {
          setSyncStatus('Rejected');
          notify(message || 'Tracking update was rejected');
          return;
        }

        try {
          await queueTelemetryPoint(bookingId, point);
        } catch (_queueErr) {
          setSyncStatus('Queue failed');
          notify('Unable to queue tracking update');
          return;
        }
        setQueuedCount((count) => count + 1);
        setSyncStatus('Queued');
        if (!offlineNoticeRef.current) {
          notify('Tracking update queued until connection returns');
          offlineNoticeRef.current = true;
        }
      }
    },
    [applyBooking, bookingId, flushQueued, notify]
  );

  const stopTracking = useCallback(
    (announce = true) => {
      if (watchIdRef.current !== null) {
        navigator.geolocation?.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      releaseWakeLock();
      setIsTracking(false);
      setSyncStatus((current) => (current === 'Live' ? 'Stopped' : current));
      if (announce) notify('Live tracking stopped');
    },
    [notify, releaseWakeLock]
  );

  const startTracking = useCallback(async () => {
    if (watchIdRef.current !== null) return;
    if (!canTrack) {
      notify('Live tracking starts after the job is assigned and active');
      return;
    }
    if (!navigator.geolocation) {
      notify('GPS is not available on this device');
      return;
    }

    if (shipment.rawStatus === 'confirmed') {
      api
        .updateBookingStatus(bookingId, { status: 'in_transit' })
        .then((data) => applyBooking(data.booking))
        .catch(() => {});
    }

    await requestWakeLock();
    setSyncStatus('Locating');
    setIsTracking(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point = normalizeBrowserPosition(position);
        if (!shouldSendTelemetry(point, lastPointRef.current, lastSentAtRef.current)) return;
        lastPointRef.current = point;
        sendOrQueue(point);
      },
      (error) => {
        setSyncStatus('GPS blocked');
        notify(error.message || 'Unable to read device location');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    notify('Live tracking started');
  }, [applyBooking, bookingId, canTrack, notify, requestWakeLock, sendOrQueue, shipment?.rawStatus]);

  useEffect(() => () => stopTracking(false), [shipment?.bookingId, stopTracking]);

  useEffect(() => {
    if (!bookingId) return undefined;
    const handleOnline = () => flushQueued();
    window.addEventListener('online', handleOnline);
    flushQueued({ quiet: true });
    return () => window.removeEventListener('online', handleOnline);
  }, [bookingId, flushQueued]);

  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === 'visible' && isTracking) requestWakeLock();
    }
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isTracking, requestWakeLock]);

  return (
    <div className="driver-live-tracker">
      <div className="tracker-heading">
        <span className={`live-dot ${isTracking ? 'active' : ''}`} />
        <div>
          <strong>Driver GPS</strong>
          <small>{syncStatus}</small>
        </div>
        <Radio size={18} />
      </div>

      <div className="tracker-stats">
        <span>Position</span>
        <strong>{lastPoint ? formatCoordinatePair(lastPoint) : 'No GPS yet'}</strong>
        <span>Accuracy</span>
        <strong>
          {Number.isFinite(Number(lastPoint?.accuracy)) ? `${Math.round(Number(lastPoint.accuracy))} m` : 'Pending'}
        </strong>
        <span>Queued</span>
        <strong>{queuedCount}</strong>
      </div>

      <div className="tracker-actions">
        <button
          className={`${isTracking ? 'secondary' : 'primary'} icon-label`}
          type="button"
          disabled={!canTrack}
          onClick={isTracking ? () => stopTracking() : startTracking}
        >
          {isTracking ? <StopCircle size={18} /> : <PlayCircle size={18} />}
          <span>{isTracking ? 'Stop' : 'Start'}</span>
        </button>
        <button className="ghost icon-label" type="button" disabled={!bookingId} onClick={() => flushQueued()}>
          <RotateCw size={18} />
          <span>Sync</span>
        </button>
      </div>
    </div>
  );
}

function DeliveryReadinessPanel({ shipment, activeRole, busyType, onConfirmDelivery, onCaptureProof }) {
  const rawStatus = shipment?.rawStatus || 'pending';
  const deliveryPending = rawStatus === 'delivery_pending';
  const tripStarted = ['in_transit', 'delivery_pending', 'delivered'].includes(rawStatus);
  const delivered = rawStatus === 'delivered';
  const destinationNeedsGps = hasDestinationCoordinates(shipment);
  const gpsReady = !destinationNeedsGps || Boolean(latestTrackingPoint(shipment)) || delivered;
  const proofDoc = deliveryProofDocument(shipment);
  const proofStatus = proofDoc?.status || (proofDoc ? 'pending' : 'missing');
  const proofMeta = documentStatusMeta(proofStatus);
  const receiverProofReady = hasReceiverGradeProof(shipment);
  const canConfirm =
    ['client', 'admin'].includes(activeRole) &&
    ['in_transit', 'delivery_pending'].includes(rawStatus) &&
    receiverProofReady &&
    gpsReady;
  const carrierOperator = ['owner', 'driver', 'admin'].includes(activeRole);
  const canCapture = carrierOperator && rawStatus === 'in_transit' && gpsReady && !receiverProofReady;
  const releaseReady = delivered && shipment?.paymentStatus === 'escrowed' && receiverProofReady;
  const releaseComplete = shipment?.paymentStatus === 'released';
  const steps = [
    {
      label: 'Carrier movement',
      value: delivered
        ? 'Delivered'
        : deliveryPending
          ? 'Awaiting acceptance'
          : tripStarted
            ? 'In transit'
            : statusLabel(rawStatus),
      tone: delivered || tripStarted ? 'success' : rawStatus === 'confirmed' ? 'warn' : 'default'
    },
    {
      label: 'Driver location',
      value: gpsReady ? (destinationNeedsGps ? 'GPS captured' : 'No geofence') : 'GPS needed',
      tone: gpsReady ? 'success' : 'warn'
    },
    {
      label: 'Receiver verification',
      value: receiverProofReady ? 'OTP + e-sign verified' : 'Receiver OTP needed',
      tone: receiverProofReady ? 'success' : 'warn'
    },
    {
      label: 'Hashed evidence',
      value: releaseComplete
        ? 'Closed'
        : releaseReady
          ? 'Payment ready'
          : delivered
            ? 'Confirmed'
            : receiverProofReady
              ? `${shipment.deliveryProof.photoCount} photo${shipment.deliveryProof.photoCount === 1 ? '' : 's'} sealed`
              : proofDoc
                ? `${proofMeta.text} only`
                : 'Photos needed',
      tone: releaseComplete || releaseReady || receiverProofReady ? 'success' : proofDoc ? proofMeta.tone : 'warn'
    }
  ];
  const primaryDisabled = Boolean(busyType) || delivered || (carrierOperator ? !canCapture : !canConfirm);
  const primaryLabel = delivered
    ? 'Trip Closed'
    : !tripStarted
      ? 'Start GPS First'
      : carrierOperator
        ? receiverProofReady || deliveryPending
          ? 'Awaiting Shipper'
          : gpsReady
            ? 'Capture Receiver Proof'
            : 'Arrival GPS Needed'
        : receiverProofReady
          ? 'Confirm Delivery'
          : 'Awaiting Receiver Proof';
  const primaryAction = carrierOperator ? onCaptureProof : onConfirmDelivery;

  return (
    <div className="delivery-readiness">
      <div className="delivery-readiness-head">
        <div>
          <p className="eyebrow">Next Step</p>
          <strong>
            {delivered
              ? 'Delivery confirmed'
              : receiverProofReady
                ? 'Ready for shipper confirmation'
                : 'Receiver-grade proof'}
          </strong>
        </div>
        <StatusBadge tone={canConfirm || delivered ? 'success' : 'warn'}>
          {delivered ? 'Closed' : canConfirm ? 'Ready' : 'Open'}
        </StatusBadge>
      </div>

      <div className="delivery-steps">
        {steps.map((step) => (
          <div className="delivery-step" key={step.label}>
            <span>{step.label}</span>
            <StatusBadge tone={step.tone}>{step.value}</StatusBadge>
          </div>
        ))}
      </div>

      <div className="closeout-document">
        <ClipboardCheck size={18} />
        <div>
          <strong>Immutable proof bundle</strong>
          <span>
            {receiverProofReady
              ? `Verified ${new Date(shipment.deliveryProof.verifiedAt).toLocaleString()}`
              : 'Receiver OTP, e-signature, arrival GPS, timestamps, and server-hashed photos'}
          </span>
        </div>
      </div>

      <button className="primary full icon-label" type="button" disabled={primaryDisabled} onClick={primaryAction}>
        {receiverProofReady ? <PackageCheck size={18} /> : <ShieldCheck size={18} />}
        <span>{primaryLabel}</span>
      </button>
    </div>
  );
}

export default function TrackingPage({ notify, route = '', user }) {
  const activeRole = roleForUser(user);
  const carrierOperator = ['owner', 'driver', 'admin'].includes(activeRole);
  const [selectedShipmentId, setSelectedShipmentId] = useState('');
  const [draftMessage, setDraftMessage] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [deliveryProofModalOpen, setDeliveryProofModalOpen] = useState(false);
  const [deliveryProofUpload, setDeliveryProofUpload] = useState(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [caseReply, setCaseReply] = useState('');
  const [caseReplyFiles, setCaseReplyFiles] = useState([]);
  const [caseActionBusy, setCaseActionBusy] = useState('');
  const [deliveryBusyType, setDeliveryBusyType] = useState('');
  const [dispatchPlan, setDispatchPlan] = useState(null);
  const chatInputRef = useRef(null);
  const bookingsQuery = useBookings();
  const shipments = bookingsQuery.data || EMPTY_SHIPMENTS;
  const { updateBooking } = useBookingCache();
  const confirmDeliveryMutation = useBookingAction(({ bookingId, location }) =>
    api.confirmDelivery(bookingId, location ? { location } : {})
  );

  const trackingParams = useMemo(() => new URLSearchParams(route.split('?')[1] || ''), [route]);
  const routeShipment = trackingParams.get('shipment');
  const contactMode = trackingParams.get('contact');
  const upsertBookingShipment = useCallback((booking) => booking && updateBooking(booking), [updateBooking]);
  const shipment =
    shipments.find((item) =>
      [item.id, item.bookingId].some((value) => String(value) === String(selectedShipmentId || routeShipment))
    ) || shipments[0];
  const shipmentMessageKey = shipment?.bookingId || shipment?.id || '';
  const messagesQuery = useMessages(shipmentMessageKey, user);
  const sendMessageMutation = useSendMessage(user);
  const receiveMessage = useConversationCache(user);
  const casesQuery = useShipmentCases(shipmentMessageKey);
  const reportCaseMutation = useCaseAction(({ payload }) => api.reportIssue(payload));
  const replyCaseMutation = useCaseAction(({ caseId, payload }) => api.addCaseComment(caseId, payload));
  const reopenCaseMutation = useCaseAction(({ caseId, payload }) => api.reopenCase(caseId, payload));
  const messages = messagesQuery.data || [];
  const shipmentCases = useMemo(() => casesQuery.data || [], [casesQuery.data]);
  const selectedCase =
    shipmentCases.find((record) => String(record._id || record.id) === String(selectedCaseId)) || shipmentCases[0];

  useEffect(() => {
    setSelectedCaseId((current) =>
      shipmentCases.some((record) => String(record._id || record.id) === String(current))
        ? current
        : String(shipmentCases[0]?._id || shipmentCases[0]?.id || '')
    );
  }, [shipmentCases]);

  useEffect(() => {
    let active = true;
    if (!shipment?.bookingId || !shipment?.dispatchPlanId) {
      setDispatchPlan(null);
      return undefined;
    }
    api
      .bookingDispatch(shipment.bookingId)
      .then((data) => active && setDispatchPlan(data.dispatchPlan || null))
      .catch(() => active && setDispatchPlan(null));
    return () => {
      active = false;
    };
  }, [shipment?.bookingId, shipment?.dispatchPlanId]);

  useEffect(() => {
    if (!shipment?.bookingId) return undefined;

    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    const updateFromBooking = (payload = {}) => {
      const booking = payload.booking || payload;
      const incomingId = booking._id || booking.id || booking.bookingId || payload.bookingId;
      if (!incomingId) return;
      if (![shipment.bookingId, shipment.id].some((value) => String(value) === String(incomingId))) return;
      upsertBookingShipment(booking);
    };

    socket.emit('join-booking', shipment.bookingId);
    socket.on('status-update', updateFromBooking);
    socket.on('delivery-confirmed', updateFromBooking);
    socket.on('delivery-proof-finalized', updateFromBooking);
    socket.on('tracking-updated', updateFromBooking);
    socket.on('message:new', (item) => receiveMessage(shipmentMessageKey, item));

    return () => socket.disconnect();
  }, [receiveMessage, shipment?.bookingId, shipment?.id, shipmentMessageKey, upsertBookingShipment]);

  useEffect(() => {
    if (!routeShipment || !shipments.length) return;
    const match = shipments.find((item) => [item.id, item.bookingId].some((value) => String(value) === routeShipment));
    if (match) setSelectedShipmentId(String(match.bookingId || match.id));
  }, [routeShipment, shipments]);

  useEffect(() => {
    if (['driver', 'shipper'].includes(contactMode)) chatInputRef.current?.focus();
  }, [contactMode, shipmentMessageKey]);

  async function sendChatMessage(event) {
    event.preventDefault();
    if (!shipment || !draftMessage.trim()) return;

    const text = draftMessage.trim();
    try {
      await sendMessageMutation.mutateAsync({
        booking: shipment.bookingId,
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        route: shipment.route,
        text,
        senderId: userIdFor(user),
        senderName: userDisplayName(user),
        senderRole: activeRole,
        sender: 'me',
        status: 'sent'
      });
      setDraftMessage('');
    } catch (err) {
      notify(err.message || 'Message was not sent');
    }
  }

  async function downloadTrackingDocument(definition) {
    if (!shipment?.bookingId) {
      notify('Open a synced booking before downloading documents');
      return;
    }

    setDeliveryBusyType(definition.type);
    try {
      await api.downloadDocument(definition.type, shipment.bookingId);
      updateBooking(upsertGeneratedBookingDocument(shipment, definition.type));
      notify(`${definition.label} ready`);
    } catch (err) {
      notify(err.message);
    } finally {
      setDeliveryBusyType('');
    }
  }

  async function confirmDelivery() {
    if (!shipment?.bookingId) {
      notify('Delivery confirmation needs a synced booking');
      return;
    }
    if (!['client', 'admin'].includes(activeRole)) {
      notify('The shipper confirms delivery after receiver proof is attached');
      return;
    }
    if (shipment.rawStatus === 'delivered') {
      notify('Delivery is already confirmed');
      return;
    }
    if (!['in_transit', 'delivery_pending'].includes(shipment.rawStatus)) {
      notify('Delivery confirmation opens after the carrier starts or ends the trip');
      return;
    }
    if (!hasReceiverGradeProof(shipment)) {
      notify('Receiver OTP, e-signature, GPS, and hashed delivery photos are required');
      return;
    }
    if (hasDestinationCoordinates(shipment) && !latestTrackingPoint(shipment)) {
      notify('Driver GPS is required before delivery confirmation');
      return;
    }

    try {
      const location = latestTrackingPoint(shipment);
      await confirmDeliveryMutation.mutateAsync({ bookingId: shipment.bookingId, location });
      notify('Delivery confirmed');
    } catch (err) {
      notify(err.message);
    }
  }

  function openDeliveryProof() {
    if (!shipment?.bookingId) {
      notify('Receiver proof needs a synced booking');
      return;
    }
    if (!carrierOperator) {
      notify('Only the assigned carrier or an administrator can capture receiver proof');
      return;
    }
    if (shipment.rawStatus === 'delivered') {
      notify('Delivery is already confirmed');
      return;
    }
    if (shipment.rawStatus !== 'in_transit') {
      notify('Receiver proof opens after the carrier starts the trip');
      return;
    }
    if (hasDestinationCoordinates(shipment) && !latestTrackingPoint(shipment)) {
      notify('Arrival GPS is required before receiver proof can be captured');
      return;
    }
    setDeliveryProofUpload(null);
    setDeliveryProofModalOpen(true);
  }

  async function submitDeliveryProof(draft) {
    if (!shipment?.bookingId) return;
    setDeliveryBusyType('receiver-proof');
    try {
      const photoKey = draft.photos
        .map((file) => `${file.name}:${file.size}:${file.lastModified}`)
        .sort()
        .join('|');
      let assetIds = deliveryProofUpload?.photoKey === photoKey ? deliveryProofUpload.assetIds : null;
      if (!assetIds?.length) {
        const uploaded = await api.uploadDeliveryProofPhotos(shipment.bookingId, draft.photos, {
          capturedAt: draft.capturedAt,
          lat: draft.location.lat,
          lng: draft.location.lng,
          accuracy: draft.location.accuracy
        });
        assetIds = (uploaded.assets || []).map((asset) => asset.id);
        setDeliveryProofUpload({ photoKey, assetIds });
      }
      const data = await api.finalizeDeliveryProof(shipment.bookingId, {
        otp: draft.otp,
        assetIds,
        signerName: draft.signerName,
        signerRole: draft.signerRole,
        signatureType: 'typed',
        signatureValue: draft.signatureValue,
        consent: draft.consent,
        signedAt: draft.signedAt,
        clientTimestamp: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        location: draft.location
      });
      upsertBookingShipment(data.booking);
      setDeliveryProofUpload(null);
      setDeliveryProofModalOpen(false);
      notify('Receiver proof verified and sealed. Waiting for shipper confirmation.');
    } catch (err) {
      notify(err.message);
    } finally {
      setDeliveryBusyType('');
    }
  }

  async function reportIssue(issue = {}) {
    if (!shipment) return;

    setIssueBusy(true);
    try {
      const upload = issue.photos?.length ? await api.uploadCargo(issue.photos) : { urls: [] };
      const evidenceUrls = upload.urls || [];
      const data = await reportCaseMutation.mutateAsync({
        bookingId: shipmentMessageKey,
        payload: {
          booking: shipment.bookingId,
          bookingId: shipment.bookingId,
          shipmentId: shipment.id,
          kind: issue.kind || 'support',
          category: issue.issueType || 'other',
          title: `${issue.issueType || 'Shipment'} ${issue.kind === 'dispute' ? 'dispute' : 'support case'}`,
          message: issue.description || `Issue reported for ${shipment.route}`,
          severity: issue.severity || 'normal',
          evidenceUrls,
          evidenceFileNames: Array.from(issue.photos || []).map((file) => file.name),
          photoCount: evidenceUrls.length,
          route: shipment.route
        }
      });
      if (data.case) setSelectedCaseId(String(data.case._id || data.case.id || ''));
      setIssueModalOpen(false);
      notify(
        issue.kind === 'dispute' ? 'Dispute opened and shipment held for review' : 'Support case sent to operations'
      );
    } catch (err) {
      notify(err.message || 'Issue report was not sent to operations');
    } finally {
      setIssueBusy(false);
    }
  }

  async function replyToCase(event) {
    event.preventDefault();
    const caseId = selectedCase?._id || selectedCase?.id;
    if (!caseId || !caseReply.trim()) return;
    setCaseActionBusy(`reply-${caseId}`);
    try {
      const upload = caseReplyFiles.length ? await api.uploadCargo(caseReplyFiles) : { urls: [] };
      await replyCaseMutation.mutateAsync({
        bookingId: shipmentMessageKey,
        caseId,
        payload: {
          body: caseReply.trim(),
          evidenceUrls: upload.urls || [],
          evidenceFileNames: caseReplyFiles.map((file) => file.name)
        }
      });
      setCaseReply('');
      setCaseReplyFiles([]);
      notify('Case update sent');
    } catch (err) {
      notify(err.message || 'Unable to update this case');
    } finally {
      setCaseActionBusy('');
    }
  }

  async function reopenShipmentCase() {
    const caseId = selectedCase?._id || selectedCase?.id;
    if (!caseId) return;
    setCaseActionBusy(`reopen-${caseId}`);
    try {
      await reopenCaseMutation.mutateAsync({
        bookingId: shipmentMessageKey,
        caseId,
        payload: { note: 'Participant requested additional review' }
      });
      notify('Case reopened');
    } catch (err) {
      notify(err.message || 'Unable to reopen this case');
    } finally {
      setCaseActionBusy('');
    }
  }

  async function submitShipmentRating(score) {
    if (!shipment?.bookingId) {
      notify('Ratings require a synced booking');
      return;
    }

    if (shipment.rawStatus !== 'delivered') {
      notify('Ratings open after delivery is confirmed');
      return;
    }

    const target = activeRole === 'owner' ? 'client' : 'owner';
    setRatingBusy(true);
    try {
      await api.rateBooking(shipment.bookingId, {
        score,
        target,
        comment: target === 'client' ? 'Rated shipper after delivery' : 'Rated carrier after delivery'
      });
      notify(target === 'client' ? 'Shipper rating recorded' : 'Carrier rating recorded');
    } catch (err) {
      notify(err.message);
    } finally {
      setRatingBusy(false);
    }
  }

  async function shareTrackingLink() {
    const url = `${window.location.origin}/app/tracking?shipment=${encodeURIComponent(shipment.id)}`;
    try {
      await copyToClipboard(url);
      notify('Tracking link copied');
    } catch (_err) {
      notify('Unable to copy tracking link');
    }
  }

  if (bookingsQuery.isPending) {
    return (
      <Panel title="Live Tracking" eyebrow="Shipments">
        <p className="refresh-status" role="status">
          Loading live shipment positions...
        </p>
      </Panel>
    );
  }

  if (bookingsQuery.isError) {
    return (
      <Panel title="Live Tracking" eyebrow="Shipments">
        <AsyncState
          title="Live tracking unavailable"
          detail={bookingsQuery.error?.message || 'Shipment positions could not be loaded.'}
          onRetry={() => bookingsQuery.refetch()}
        />
      </Panel>
    );
  }

  if (!shipment) {
    return (
      <Panel title="Live Tracking" eyebrow="Shipments">
        <EmptyState
          title="No active live shipments"
          detail="Tracking opens after a booking is confirmed and a vehicle starts sending route updates."
        />
      </Panel>
    );
  }

  const ratingTitle = carrierOperator ? 'Rate Shipper' : 'Rate Carrier';
  const contactTarget = carrierOperator ? 'shipper' : 'driver';
  const contactLabel = carrierOperator ? 'Contact Shipper' : 'Contact Driver';
  const chatTitle = carrierOperator ? 'Shipper Chat' : 'Driver Chat';
  const contactOpen = ['driver', 'shipper'].includes(contactMode);
  const selectedShipmentRoute = `/app/tracking?shipment=${encodeURIComponent(shipment.id)}`;
  const timelineStatus =
    shipment.rawStatus ||
    (shipment.progress >= 100
      ? 'delivered'
      : shipment.progress >= 64
        ? 'in_transit'
        : shipment.progress >= 38
          ? 'confirmed'
          : 'bidding');
  const trackingDocumentDefinitions = [
    { label: 'Waybill', type: 'waybill', labels: { missing: 'Download', approved: 'Ready' } },
    {
      label: carrierOperator ? 'Proof of delivery' : 'Receiver confirmation',
      type: carrierOperator ? 'pod' : 'receiver-confirmation',
      labels: { missing: carrierOperator ? 'Capture proof' : 'Waiting', approved: 'Ready' }
    }
  ];

  return (
    <>
      <section className="tracking-layout">
        <Panel title="Active Routes" eyebrow="Shipments">
          <div className="tracking-list">
            {shipments.map((item) => {
              const itemId = String(item.bookingId || item.id);
              return (
                <button
                  className={itemId === String(shipment.bookingId || shipment.id) ? 'active' : ''}
                  type="button"
                  key={item.id}
                  onClick={() => setSelectedShipmentId(itemId)}
                >
                  <strong>{item.id}</strong>
                  <span>{item.route}</span>
                  <small>
                    {item.progress}% - {item.position}
                  </small>
                </button>
              );
            })}
          </div>
        </Panel>

        <section className="map-panel">
          <div className="map-toolbar">
            <div>
              <StatusBadge tone="success">{shipment.status}</StatusBadge>
              <strong>{shipment.route}</strong>
            </div>
            <button className="ghost icon-label" type="button" onClick={shareTrackingLink}>
              <MessageSquare size={18} />
              <span>Share</span>
            </button>
          </div>
          <ProductionRouteMap shipment={shipment} />
          <div className="map-status">
            <LivePositionCard shipment={shipment} />
            <small>
              <Navigation size={14} />
              ETA {shipment.eta}
            </small>
            {shipment.routeDeviation?.isDeviated ? (
              <small className="route-alert">
                <AlertTriangle size={14} />
                Route deviation: {Math.round(Number(shipment.routeDeviation.distanceMeters || 0))} m
              </small>
            ) : null}
            {shipment.etaDetails?.remainingDistanceMeters ? (
              <small>
                <MapPin size={14} />
                {(Number(shipment.etaDetails.remainingDistanceMeters) / 1000).toFixed(1)} km remaining
              </small>
            ) : null}
          </div>
        </section>

        <aside className="tracking-side">
          <Panel title="Shipment" eyebrow="Status">
            <div className="facts-grid">
              <span>Driver</span>
              <strong>{shipment.driver}</strong>
              <span>Cargo</span>
              <strong>{shipment.cargo}</strong>
              <span>Vehicle</span>
              <strong>
                {shipment.vehicle} - {shipment.plate}
              </strong>
              <span>Payment</span>
              <strong>{shipment.payment}</strong>
            </div>
            <div className="progress">
              <span style={{ width: `${shipment.progress}%` }} />
            </div>
            {carrierOperator ? (
              <DriverLiveTracker
                key={shipment.bookingId || shipment.id}
                shipment={shipment}
                notify={notify}
                onBookingUpdate={upsertBookingShipment}
              />
            ) : null}
            <ShipmentTimeline rawStatus={timelineStatus} tracking={shipment.tracking || []} />
          </Panel>

          <Panel title="Trip Documents" eyebrow="Generated">
            <div className="doc-list compact tracking-docs">
              {trackingDocumentDefinitions.map((definition) => (
                <DocumentSlotButton
                  key={definition.type}
                  label={definition.label}
                  status={shipmentDocumentStatus(shipment, definition.type)}
                  busy={deliveryBusyType === definition.type}
                  busyText="Opening..."
                  disabled={deliveryBusyType === definition.type}
                  labels={{
                    missing: definition.labels.missing,
                    pending: 'Review',
                    approved: definition.labels.approved
                  }}
                  onClick={() => {
                    if (
                      ['pod', 'receiver-confirmation'].includes(definition.type) &&
                      !hasReceiverGradeProof(shipment)
                    ) {
                      if (carrierOperator) openDeliveryProof();
                      else notify('Receiver proof is still waiting for carrier capture.');
                      return;
                    }
                    downloadTrackingDocument(definition);
                  }}
                  title={`${definition.labels.missing} ${definition.label.toLowerCase()}`}
                />
              ))}
            </div>
          </Panel>

          {dispatchPlan?.stops?.length ? (
            <Panel title="Dispatch Stops" eyebrow={shipment.loadMode === 'ltl' ? 'Shared Load' : 'Assignment'}>
              <div className="dispatch-stop-list">
                {dispatchPlan.stops.map((stop) => (
                  <div
                    className={String(stop.booking?._id || stop.booking) === String(shipment.bookingId) ? 'active' : ''}
                    key={`${stop.sequence}-${stop.type}-${stop.booking?._id || stop.booking}`}
                  >
                    <span>{stop.sequence}</span>
                    <div>
                      <strong>
                        {statusLabel(stop.type)} · {stop.label}
                      </strong>
                      <small>{statusLabel(stop.status)}</small>
                    </div>
                  </div>
                ))}
              </div>
              <div className="facts-grid">
                <span>Reserved</span>
                <strong>{Number(dispatchPlan.reservedTonnes || 0).toFixed(1)} t</strong>
                <span>Remaining</span>
                <strong>{Number(dispatchPlan.remainingTonnes || 0).toFixed(1)} t</strong>
              </div>
            </Panel>
          ) : null}

          <Panel title="Closeout" eyebrow="Delivery">
            <DeliveryReadinessPanel
              shipment={shipment}
              activeRole={activeRole}
              busyType={deliveryBusyType}
              onConfirmDelivery={confirmDelivery}
              onCaptureProof={openDeliveryProof}
            />
          </Panel>

          <Panel title="Support" eyebrow="Help">
            <div className="stack-actions">
              <button
                className="secondary icon-label"
                type="button"
                onClick={() => navigate(`${selectedShipmentRoute}&contact=${contactTarget}`)}
              >
                <Phone size={18} />
                <span>{contactLabel}</span>
              </button>
              <button className="ghost icon-label" type="button" onClick={() => setIssueModalOpen(true)}>
                <AlertTriangle size={18} />
                <span>Report Issue</span>
              </button>
            </div>
            {casesQuery.isPending ? <AsyncState compact title="Loading support cases..." /> : null}
            {casesQuery.isError ? (
              <AsyncState
                compact
                title="Support cases could not be loaded"
                detail={casesQuery.error?.message}
                onRetry={() => casesQuery.refetch()}
              />
            ) : null}
            {shipmentCases.length ? (
              <div className="shipment-case-workspace">
                <div className="shipment-case-list">
                  {shipmentCases.map((record) => {
                    const caseId = String(record._id || record.id);
                    return (
                      <button
                        type="button"
                        className={caseId === String(selectedCase?._id || selectedCase?.id) ? 'active' : ''}
                        key={caseId}
                        onClick={() => setSelectedCaseId(caseId)}
                      >
                        <strong>{record.caseNumber || caseId}</strong>
                        <span>{statusLabel(record.status)}</span>
                        <small>{statusLabel(record.kind || 'support')}</small>
                      </button>
                    );
                  })}
                </div>
                {selectedCase ? (
                  <div className="shipment-case-detail">
                    <div className="shipment-case-heading">
                      <div>
                        <StatusBadge
                          tone={
                            ['urgent', 'high'].includes(selectedCase.priority)
                              ? 'danger'
                              : selectedCase.status === 'resolved'
                                ? 'success'
                                : 'warn'
                          }
                        >
                          {statusLabel(selectedCase.priority || 'normal')}
                        </StatusBadge>
                        <strong>{selectedCase.title || selectedCase.caseNumber}</strong>
                      </div>
                      <small>
                        Resolution target{' '}
                        {selectedCase.resolutionDueAt
                          ? new Date(selectedCase.resolutionDueAt).toLocaleString([], {
                              dateStyle: 'medium',
                              timeStyle: 'short'
                            })
                          : 'pending'}
                      </small>
                    </div>
                    <p>{selectedCase.message}</p>
                    {(selectedCase.evidence || []).length ? (
                      <div className="case-evidence-links">
                        {selectedCase.evidence.map((item, index) => (
                          <a href={item.url} target="_blank" rel="noreferrer" key={item._id || item.url}>
                            {item.fileName || `Evidence ${index + 1}`}
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {selectedCase.resolution?.summary ? (
                      <div className="case-resolution-box">
                        <strong>{statusLabel(selectedCase.resolution.outcome || 'resolved')}</strong>
                        <p>{selectedCase.resolution.summary}</p>
                        {(selectedCase.resolution.evidenceUrls || []).length ? (
                          <div className="case-evidence-links">
                            {selectedCase.resolution.evidenceUrls.map((url, index) => (
                              <a href={url} target="_blank" rel="noreferrer" key={url}>
                                Resolution evidence {index + 1}
                              </a>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="case-comment-thread">
                      {(selectedCase.comments || []).map((comment) => (
                        <div className="case-comment" key={comment._id || `${comment.createdAt}-${comment.body}`}>
                          <strong>
                            {[comment.author?.firstName, comment.author?.lastName].filter(Boolean).join(' ') ||
                              comment.author?.email ||
                              'Case participant'}
                          </strong>
                          <span>{comment.body}</span>
                          {(comment.evidence || []).length ? (
                            <div className="case-evidence-links">
                              {comment.evidence.map((item, index) => (
                                <a href={item.url} target="_blank" rel="noreferrer" key={item._id || item.url}>
                                  {item.fileName || `Attachment ${index + 1}`}
                                </a>
                              ))}
                            </div>
                          ) : null}
                          <small>{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : ''}</small>
                        </div>
                      ))}
                    </div>
                    {(selectedCase.timeline || []).length ? (
                      <div className="case-timeline">
                        {selectedCase.timeline.slice(-6).map((event) => (
                          <div key={event._id || `${event.action}-${event.createdAt}`}>
                            <strong>{statusLabel(event.action?.replaceAll('.', '_') || 'case update')}</strong>
                            <span>
                              {event.note || `${statusLabel(event.fromStatus)} to ${statusLabel(event.toStatus)}`}
                            </span>
                            <small>{event.createdAt ? new Date(event.createdAt).toLocaleString() : ''}</small>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {['resolved', 'dismissed'].includes(selectedCase.status) ? (
                      <button
                        className="secondary"
                        type="button"
                        disabled={caseActionBusy === `reopen-${selectedCase._id || selectedCase.id}`}
                        onClick={reopenShipmentCase}
                      >
                        Reopen case
                      </button>
                    ) : selectedCase.status === 'closed' ? (
                      <p className="muted-note">This case is closed. Open a follow-up case if more help is needed.</p>
                    ) : (
                      <form className="case-reply-form" onSubmit={replyToCase}>
                        <textarea
                          value={caseReply}
                          onChange={(event) => setCaseReply(event.target.value)}
                          placeholder="Add an update for operations..."
                          rows={3}
                        />
                        <label className="case-file-input">
                          <span>Add evidence</span>
                          <input
                            type="file"
                            accept={documentUploadAccept}
                            multiple
                            onChange={(event) => setCaseReplyFiles(Array.from(event.target.files || []).slice(0, 10))}
                          />
                          <small>
                            {caseReplyFiles.length
                              ? `${caseReplyFiles.length} file${caseReplyFiles.length === 1 ? '' : 's'} selected`
                              : 'Optional'}
                          </small>
                        </label>
                        <button
                          className="secondary"
                          type="submit"
                          disabled={caseActionBusy === `reply-${selectedCase._id || selectedCase.id}`}
                        >
                          Send update
                        </button>
                      </form>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
            {!casesQuery.isPending && !casesQuery.isError && !shipmentCases.length ? (
              <EmptyState title="No support cases" detail="Report an issue when operations assistance is required." />
            ) : null}
            {shipment.rawStatus === 'delivered' ? (
              <div className="rating-panel">
                <strong>{ratingTitle}</strong>
                <div className="rating-strip" aria-label={ratingTitle}>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <button
                      type="button"
                      key={score}
                      disabled={ratingBusy}
                      onClick={() => submitShipmentRating(score)}
                      aria-label={`${ratingTitle} ${score} out of 5`}
                    >
                      {score}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </Panel>

          {contactOpen ? (
            <Panel
              title={chatTitle}
              eyebrow="In-house Text"
              action="Close"
              onAction={() => navigate(selectedShipmentRoute)}
            >
              <div className="chat-thread">
                {messagesQuery.isPending ? <AsyncState compact title="Loading message history..." /> : null}
                {messagesQuery.isError ? (
                  <AsyncState
                    compact
                    title="Message history could not be loaded"
                    detail={messagesQuery.error?.message}
                    onRetry={() => messagesQuery.refetch()}
                  />
                ) : null}
                {!messagesQuery.isPending && !messagesQuery.isError
                  ? messages.map((message) => <ChatBubble message={message} key={message.id} />)
                  : null}
                {!messagesQuery.isPending && !messagesQuery.isError && !messages.length ? (
                  <EmptyState title="No messages in this thread" detail="Send the first shipment update." />
                ) : null}
              </div>
              <form className="chat-compose" onSubmit={sendChatMessage}>
                <input
                  ref={chatInputRef}
                  value={draftMessage}
                  disabled={sendMessageMutation.isPending}
                  onChange={(event) => setDraftMessage(event.target.value)}
                  placeholder="Type a message..."
                />
                <button
                  className="primary"
                  type="submit"
                  aria-label={sendMessageMutation.isPending ? 'Sending message' : 'Send message'}
                  disabled={!draftMessage.trim() || sendMessageMutation.isPending}
                >
                  <Send size={18} />
                </button>
              </form>
            </Panel>
          ) : null}
        </aside>
        {issueModalOpen ? (
          <ReportIssueModal
            shipment={shipment}
            busy={issueBusy}
            onClose={() => setIssueModalOpen(false)}
            onSubmit={reportIssue}
          />
        ) : null}
        {deliveryProofModalOpen ? (
          <DeliveryProofModal
            shipment={shipment}
            busy={deliveryBusyType === 'receiver-proof'}
            onClose={() => {
              setDeliveryProofUpload(null);
              setDeliveryProofModalOpen(false);
            }}
            onSubmit={submitDeliveryProof}
          />
        ) : null}
      </section>
    </>
  );
}
