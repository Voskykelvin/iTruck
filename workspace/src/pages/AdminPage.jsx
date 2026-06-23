import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Truck, CreditCard, FileText } from 'lucide-react';
import { api } from '../api.js';
import MetricCard from '../components/MetricCard.jsx';
import Panel from '../components/Panel.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { usePollingEffect } from '../hooks/usePolling.js';
import {
  mergeDocumentIndex,
  statusLabel,
  normalizeProfileDocumentType,
  normalizeBookingDocumentType,
  normalizeTruckDocumentType,
  profileDocumentsForRole,
  ownerVehicleDocuments,
  bookingRef,
  bookingRoute,
  money,
  documentUploadAccept
} from '../utils/helpers.js';

export default function AdminPage({ notify, user }) {
  const [stats, setStats] = useState(null);
  const [adminData, setAdminData] = useState({
    users: [],
    trucks: [],
    bookings: [],
    documents: [],
    payments: [],
    cases: [],
    notificationDeliveries: [],
    logs: []
  });
  const [busyAction, setBusyAction] = useState('');
  const [activeReview, setActiveReview] = useState('kyc');
  const [reviewNotes, setReviewNotes] = useState({});
  const [caseDrafts, setCaseDrafts] = useState({});

  const loadAdminData = useCallback(async () => {
    const [
      statsResult,
      usersResult,
      trucksResult,
      bookingsResult,
      documentsResult,
      paymentsResult,
      casesResult,
      deliveriesResult,
      logsResult
    ] = await Promise.allSettled([
      api.adminStats(),
      api.adminListUsers(),
      api.adminListTrucks(),
      api.adminListBookings(),
      api.listDocuments({ limit: 100 }),
      api.adminListPayments(),
      api.adminCases({ limit: 100 }),
      api.adminNotificationDeliveries(),
      api.adminAuditLogs()
    ]);

    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    else setStats(null);

    const indexedDocuments = documentsResult.status === 'fulfilled' ? documentsResult.value.documents || [] : [];
    const users = usersResult.status === 'fulfilled' ? usersResult.value.users || [] : [];
    const trucks = trucksResult.status === 'fulfilled' ? trucksResult.value.trucks || [] : [];
    const bookings = bookingsResult.status === 'fulfilled' ? bookingsResult.value.bookings || [] : [];

    setAdminData({
      users: mergeDocumentIndex(users, indexedDocuments, 'user'),
      trucks: mergeDocumentIndex(trucks, indexedDocuments, 'truck'),
      bookings: mergeDocumentIndex(bookings, indexedDocuments, 'booking'),
      documents: indexedDocuments,
      payments: paymentsResult.status === 'fulfilled' ? paymentsResult.value.transactions || [] : [],
      cases: casesResult.status === 'fulfilled' ? casesResult.value.cases || [] : [],
      notificationDeliveries: deliveriesResult.status === 'fulfilled' ? deliveriesResult.value.deliveries || [] : [],
      logs: logsResult.status === 'fulfilled' ? logsResult.value.logs || [] : []
    });
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  usePollingEffect(true, loadAdminData, 30000);

  function recordId(record) {
    if (typeof record === 'string' || typeof record === 'number') return String(record);
    return String(record?._id || record?.id || record?.bookingId || '');
  }

  function personName(user) {
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'selected owner';
  }

  function roleLabel(role = 'user') {
    if (role === 'client') return 'Shipper';
    if (role === 'owner') return 'Fleet owner';
    return statusLabel(role);
  }

  function formatDocumentLabel(type) {
    return String(type || 'Document')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function documentTone(status = 'missing') {
    if (status === 'approved') return 'success';
    if (status === 'pending') return 'warn';
    if (['expired', 'rejected'].includes(status)) return 'danger';
    return 'default';
  }

  // Define components/DocumentSlotButton helper manually since we don't have it imported or we can import it.
  // Wait, does AdminPage use DocumentSlotButton? Yes, in renderDocumentReview and renderKycReview.
  // Oh! We must import DocumentSlotButton from '../components/DocumentSlotButton.jsx'.
  // Let's verify that. Yes:
  // <DocumentSlotButton label={item} status={docStatus} ... />
  // Yes, it is used at line 4100 inside OnboardingPage and line 4916 inside DocumentsPage.
  // Wait, let's look at lines 6125 to 6194 to see if AdminPage uses DocumentSlotButton.
  // No, in renderDocumentReview it uses native div and StatusBadge, not DocumentSlotButton!
  // Let's check lines 4916 and 4100. Ah, in renderDocumentReview it uses:
  // <StatusBadge tone={documentTone(doc.status)}>{documentStatusText(doc.status)}</StatusBadge>
  // So it does NOT use DocumentSlotButton! That's great, one less import.

  function documentStatusText(status = 'missing') {
    if (status === 'missing') return 'Missing';
    return statusLabel(status);
  }

  function documentList(record) {
    return Array.isArray(record?.documents) ? record.documents : [];
  }

  function documentNormalizerFor(targetType, record) {
    if (targetType === 'user' || record?.role) return (type) => normalizeProfileDocumentType(type, record?.role);
    if (targetType === 'booking' || record?.pickup || record?.destination || record?.cargo) {
      return normalizeBookingDocumentType;
    }
    return normalizeTruckDocumentType;
  }

  function expectedProfileDocuments(user) {
    return profileDocumentsForRole(user?.role);
  }

  function expectedTruckDocuments() {
    return ownerVehicleDocuments.filter((item) => normalizeTruckDocumentType(item) !== 'vehicle-photos');
  }

  function documentRows(record, expectedLabels = [], targetType = '') {
    const normalize = documentNormalizerFor(targetType, record);
    const byType = new Map(
      documentList(record).map((doc) => {
        const type = normalize(doc.type);
        return [type, { ...doc, type }];
      })
    );
    const rows = expectedLabels.map((label) => {
      const type = normalize(label);
      const existing = byType.get(type);
      if (existing) {
        byType.delete(type);
        return existing;
      }
      return { type, status: 'missing', missing: true };
    });

    byType.forEach((doc) => rows.push(doc));
    return rows;
  }

  function missingRequiredDocuments(record, expectedLabels = []) {
    return documentRows(record, expectedLabels).filter((doc) => doc.missing || doc.status === 'missing');
  }

  function reviewableDocuments(record, expectedLabels = []) {
    return documentRows(record, expectedLabels).filter(
      (doc) => !doc.missing && doc.status !== 'missing' && doc.status !== 'approved'
    );
  }

  function needsDocumentReview(record) {
    return (record?.documents || []).some((doc) => ['pending', 'expired'].includes(doc.status));
  }

  function reviewNoteKey(scope, record, documentType = 'all') {
    return `${scope}:${recordId(record)}:${documentType}`;
  }

  function updateReviewNote(key, value) {
    setReviewNotes((current) => ({ ...current, [key]: value }));
  }

  function caseDraft(record) {
    const id = recordId(record);
    return {
      assignedTo: recordId(record.assignedTo) || recordId(user),
      status: record.status === 'open' ? 'triaged' : record.status || 'in_progress',
      note: '',
      visibility: 'participants',
      outcome: record.kind === 'dispute' ? 'resume_booking' : 'no_action',
      summary: '',
      files: [],
      ...(caseDrafts[id] || {})
    };
  }

  function updateCaseDraft(record, patch) {
    const id = recordId(record);
    setCaseDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), ...patch }
    }));
  }

  function plateKey(truck) {
    return String(truck?.plateNumber || truck?.plate || '')
      .trim()
      .toUpperCase();
  }

  function truckName(truck) {
    return [truck?.make, truck?.model].filter(Boolean).join(' ') || truck?.type || 'Truck';
  }

  function adminBookingRef(booking) {
    if (Array.isArray(booking)) return booking[0] || 'ITK-PENDING';
    return bookingRef(booking);
  }

  function adminBookingRoute(booking) {
    if (Array.isArray(booking)) return booking[1] || 'Route pending';
    return bookingRoute(booking);
  }

  function adminBookingStatus(booking) {
    if (Array.isArray(booking)) return booking[2] || 'pending';
    return booking?.status || 'pending';
  }

  function bookingAmount(booking) {
    return Number(booking?.cargoValue || booking?.budget || booking?.paymentAmount || booking?.amount || 0);
  }

  function formatDateTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }

  const usersById = adminData.users.reduce((map, user) => map.set(recordId(user), user), new Map());

  function ownerNameForTruck(truck) {
    const ownerId = typeof truck?.owner === 'object' ? recordId(truck.owner) : String(truck?.owner || '');
    const owner = usersById.get(ownerId);
    return owner ? personName(owner) : truck?.ownerName || 'Owner pending';
  }

  const plateGroups = adminData.trucks.reduce((groups, truck) => {
    const plate = plateKey(truck);
    if (!plate) return groups;
    return { ...groups, [plate]: [...(groups[plate] || []), truck] };
  }, {});

  function hasDuplicatePlate(truck) {
    const plate = plateKey(truck);
    return Boolean(plate && plateGroups[plate]?.length > 1);
  }

  function normalizedPhone(user) {
    return String(user?.phone || '').replace(/\D/g, '');
  }

  const profileGroups = adminData.users
    .filter((user) => user.role !== 'admin')
    .reduce((groups, user) => {
      const phone = normalizedPhone(user);
      const nameKey = [user?.firstName, user?.lastName, user?.country, user?.role]
        .map((item) =>
          String(item || '')
            .trim()
            .toLowerCase()
        )
        .filter(Boolean)
        .join(':');
      const keys = [
        phone.length >= 6 ? `Phone ${phone}` : '',
        nameKey ? `Name ${nameKey.replaceAll(':', ' / ')}` : ''
      ].filter(Boolean);

      return keys.reduce(
        (nextGroups, key) => ({
          ...nextGroups,
          [key]: [...(nextGroups[key] || []), user]
        }),
        groups
      );
    }, {});

  const kycUsers = adminData.users.filter(
    (user) => user.role !== 'admin' && (!user.isVerified || needsDocumentReview(user))
  );
  const truckReviewItems = adminData.trucks.filter(
    (truck) => !truck.isVerified || needsDocumentReview(truck) || hasDuplicatePlate(truck)
  );
  const bookingDocumentReviewItems = adminData.bookings.filter((booking) => needsDocumentReview(booking));
  const approvedUsers = adminData.users.filter(
    (user) => user.role !== 'admin' && user.isVerified && !needsDocumentReview(user)
  );
  const approvedTrucks = adminData.trucks.filter(
    (truck) => truck.isVerified && !needsDocumentReview(truck) && !hasDuplicatePlate(truck)
  );
  const delayedBookings = adminData.bookings.filter((booking) =>
    ['in_transit', 'disputed', 'delayed'].includes(String(adminBookingStatus(booking)).toLowerCase())
  );
  const releaseReadyBookings = adminData.bookings.filter(
    (booking) => booking.status === 'delivered' && booking.paymentStatus === 'escrowed'
  );
  const highValueBookings = adminData.bookings.filter((booking) => bookingAmount(booking) >= 5000);
  const activeCases = adminData.cases.filter(
    (record) => !['resolved', 'dismissed', 'closed'].includes(String(record.status || '').toLowerCase())
  );
  const breachedCases = activeCases.filter((record) => record.firstResponseBreachedAt || record.resolutionBreachedAt);
  const duplicatePlateGroups = Object.entries(plateGroups).filter(([, trucks]) => trucks.length > 1);
  const duplicateProfileGroups = Object.entries(profileGroups).filter(([, users]) => users.length > 1);
  const expiredDocumentReviews = [
    ...adminData.users.flatMap((user) =>
      documentList(user)
        .filter((doc) => doc.status === 'expired')
        .map((doc) => ({ targetType: 'user', record: user, doc }))
    ),
    ...adminData.trucks.flatMap((truck) =>
      documentList(truck)
        .filter((doc) => doc.status === 'expired')
        .map((doc) => ({ targetType: 'truck', record: truck, doc }))
    ),
    ...adminData.bookings.flatMap((booking) =>
      documentList(booking)
        .filter((doc) => doc.status === 'expired')
        .map((doc) => ({ targetType: 'booking', record: booking, doc }))
    )
  ];

  const riskItems = [
    {
      key: 'duplicates',
      label: 'Duplicate profile and listing checks',
      count: duplicatePlateGroups.length + duplicateProfileGroups.length
    },
    {
      key: 'payments',
      label: 'Payment release approval',
      count: releaseReadyBookings.length
    },
    {
      key: 'high-value',
      label: 'High-value cargo review',
      count: highValueBookings.length
    },
    {
      key: 'expiry',
      label: 'Carrier document expiry alerts',
      count: expiredDocumentReviews.length
    }
  ];

  const adminTabs = [
    { key: 'kyc', label: 'KYC', count: kycUsers.length, tone: kycUsers.length ? 'warn' : 'success' },
    {
      key: 'trucks',
      label: 'Trucks',
      count: truckReviewItems.length,
      tone: truckReviewItems.length ? 'warn' : 'success'
    },
    {
      key: 'shipments',
      label: 'Shipment docs',
      count: bookingDocumentReviewItems.length,
      tone: bookingDocumentReviewItems.length ? 'warn' : 'success'
    },
    { key: 'approved-profiles', label: 'Approved profiles', count: approvedUsers.length, tone: 'success' },
    { key: 'approved-trucks', label: 'Approved trucks', count: approvedTrucks.length, tone: 'success' },
    {
      key: 'payments',
      label: 'Payments',
      count: releaseReadyBookings.length,
      tone: releaseReadyBookings.length ? 'warn' : 'default'
    },
    {
      key: 'notifications',
      label: 'Delivery queue',
      count: adminData.notificationDeliveries.filter((item) => ['failed', 'retry'].includes(item.status)).length,
      tone: adminData.notificationDeliveries.some((item) => item.status === 'failed') ? 'danger' : 'default'
    },
    {
      key: 'cases',
      label: 'Support cases',
      count: activeCases.length,
      tone: breachedCases.length ? 'danger' : activeCases.length ? 'warn' : 'success'
    },
    {
      key: 'risk',
      label: 'Risk',
      count:
        duplicatePlateGroups.length +
        duplicateProfileGroups.length +
        highValueBookings.length +
        expiredDocumentReviews.length +
        delayedBookings.length,
      tone:
        duplicatePlateGroups.length ||
        duplicateProfileGroups.length ||
        highValueBookings.length ||
        expiredDocumentReviews.length
          ? 'warn'
          : 'default'
    }
  ];

  async function withAdminAction(actionKey, action) {
    setBusyAction(actionKey);
    try {
      await action();
    } catch (err) {
      notify(err.message || 'Admin action failed');
    } finally {
      setBusyAction('');
    }
  }

  async function refreshAdminData() {
    await withAdminAction('refresh', async () => {
      await loadAdminData();
      notify('Admin review data refreshed');
    });
  }

  async function reviewDocument(targetType, record, doc, status) {
    if (!recordId(record) || doc.missing || doc.status === 'missing') {
      notify('Upload this document before review');
      return;
    }

    const key = `${targetType}-${recordId(record)}-${doc.type}-${status}`;
    await withAdminAction(key, async () => {
      const note =
        reviewNotes[reviewNoteKey(targetType, record, doc.type)] ||
        `${formatDocumentLabel(doc.type)} marked ${documentStatusText(status).toLowerCase()} from admin workspace`;
      const request =
        targetType === 'truck'
          ? api.adminReviewTruckDocument
          : targetType === 'booking'
            ? api.adminReviewBookingDocument
            : api.adminReviewUserDocument;
      await request(recordId(record), doc.type, { status, notes: note });
      if (status !== 'approved') {
        if (targetType === 'truck') await api.adminVerifyTruck(recordId(record), false);
        else if (targetType === 'user') await api.adminVerifyUser(recordId(record), false);
      }
      notify(`${formatDocumentLabel(doc.type)} marked ${documentStatusText(status).toLowerCase()}`);
      await loadAdminData();
    });
  }

  async function approveProfile(user) {
    const expected = expectedProfileDocuments(user);
    const missing = missingRequiredDocuments(user, expected);

    if (missing.length) {
      notify(
        `${personName(user)} still has ${missing.length} missing required document${missing.length === 1 ? '' : 's'}`
      );
      return;
    }

    await withAdminAction(`profile-${recordId(user)}-approve`, async () => {
      const note = reviewNotes[reviewNoteKey('user', user)] || 'Profile approved from admin workspace';
      await Promise.all(
        reviewableDocuments(user, expected).map((doc) =>
          api.adminReviewUserDocument(recordId(user), doc.type, { status: 'approved', notes: note })
        )
      );
      await api.adminVerifyUser(recordId(user), true);
      notify(`${personName(user)} verified`);
      await loadAdminData();
    });
  }

  async function holdProfile(user) {
    await withAdminAction(`profile-${recordId(user)}-hold`, async () => {
      await api.adminVerifyUser(recordId(user), false);
      notify(`${personName(user)} held for review`);
      await loadAdminData();
    });
  }

  async function deleteProfile(user, category = 'suspicious') {
    const key = reviewNoteKey('user', user);
    const reason = String(reviewNotes[key] || '').trim();

    if (reason.length < 8) {
      notify(`Add a deletion reason for ${personName(user)}`);
      return;
    }

    if (!window.confirm(`Delete ${personName(user)}? This cannot be undone.`)) return;

    await withAdminAction(`profile-${recordId(user)}-delete`, async () => {
      const data = await api.adminDeleteUser(recordId(user), { reason, category });
      const removed = data.removed || {};
      notify(
        `${personName(user)} deleted${removed.trucks ? ` with ${removed.trucks} linked vehicle${removed.trucks === 1 ? '' : 's'}` : ''}`
      );
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
      await loadAdminData();
    });
  }

  async function approveTruck(truck) {
    const expected = expectedTruckDocuments();
    const missing = missingRequiredDocuments(truck, expected);
    const photoCount = Array.isArray(truck?.photos) ? truck.photos.length : 0;

    if (!photoCount) {
      notify(`${plateKey(truck) || 'Truck'} still needs vehicle photos`);
      return;
    }

    if (missing.length) {
      notify(
        `${plateKey(truck) || 'Truck'} still has ${missing.length} missing required document${missing.length === 1 ? '' : 's'}`
      );
      return;
    }

    if (hasDuplicatePlate(truck)) {
      notify(`${plateKey(truck)} has duplicate listings to resolve first`);
      return;
    }

    await withAdminAction(`truck-${recordId(truck)}-approve`, async () => {
      const note = reviewNotes[reviewNoteKey('truck', truck)] || 'Truck approved from admin workspace';
      await Promise.all(
        reviewableDocuments(truck, expected).map((doc) =>
          api.adminReviewTruckDocument(recordId(truck), doc.type, { status: 'approved', notes: note })
        )
      );
      await api.adminVerifyTruck(recordId(truck), true);
      notify(`${plateKey(truck) || truckName(truck)} verified`);
      await loadAdminData();
    });
  }

  async function holdTruck(truck) {
    await withAdminAction(`truck-${recordId(truck)}-hold`, async () => {
      await api.adminVerifyTruck(recordId(truck), false);
      notify(`${plateKey(truck) || truckName(truck)} held for review`);
      await loadAdminData();
    });
  }

  async function runAdminOperation(key) {
    setBusyAction(key);
    try {
      if (key === 'delay') {
        const booking = delayedBookings[0];
        await api.adminNotify({
          title: 'Route delay review',
          message: booking
            ? `${adminBookingRef(booking)} route delay queued for operator follow-up`
            : 'Route delay queue checked',
          priority: booking ? 'high' : 'normal'
        });
        notify(booking ? `Route delay follow-up queued for ${adminBookingRef(booking)}` : 'Route delay queue checked');
        await loadAdminData();
        return;
      }

      if (key === 'escrow') {
        const booking = releaseReadyBookings[0];
        if (!booking) {
          notify('No delivered escrow booking is ready for release');
          return;
        }
        await api.releasePayment(recordId(booking));
        notify(`Payment release submitted for ${adminBookingRef(booking)}`);
        await loadAdminData();
      }
    } catch (err) {
      notify(err.message || 'Admin action failed');
    } finally {
      setBusyAction('');
    }
  }

  async function queueHighValueReview(booking) {
    await withAdminAction(`high-value-${adminBookingRef(booking)}`, async () => {
      await api.adminNotify({
        title: 'High-value cargo review',
        message: `${adminBookingRef(booking)} marked for high-value cargo checks`,
        priority: 'high'
      });
      notify(`High-value review recorded for ${adminBookingRef(booking)}`);
      await loadAdminData();
    });
  }

  async function assignSupportCase(record) {
    const draft = caseDraft(record);
    if (!draft.assignedTo) {
      notify('Choose an admin assignee');
      return;
    }
    await withAdminAction(`case-${recordId(record)}-assign`, async () => {
      await api.adminAssignCase(recordId(record), {
        assignedTo: draft.assignedTo,
        note: draft.note || 'Assigned from the support desk'
      });
      notify(`${record.caseNumber || 'Case'} assigned`);
      await loadAdminData();
    });
  }

  async function updateSupportCaseStatus(record, statusOverride) {
    const draft = caseDraft(record);
    const nextStatus = statusOverride || draft.status;
    await withAdminAction(`case-${recordId(record)}-status`, async () => {
      await api.adminUpdateCaseStatus(recordId(record), {
        status: nextStatus,
        note: draft.note || `Status changed to ${statusLabel(nextStatus)}`
      });
      notify(`${record.caseNumber || 'Case'} moved to ${statusLabel(nextStatus)}`);
      await loadAdminData();
    });
  }

  async function commentOnSupportCase(record) {
    const draft = caseDraft(record);
    if (!draft.note.trim()) {
      notify('Write a case update first');
      return;
    }
    await withAdminAction(`case-${recordId(record)}-comment`, async () => {
      const upload = draft.files.length ? await api.uploadCargo(draft.files) : { urls: [] };
      await api.adminAddCaseComment(recordId(record), {
        body: draft.note.trim(),
        visibility: draft.visibility,
        evidenceUrls: upload.urls || [],
        evidenceFileNames: draft.files.map((file) => file.name)
      });
      updateCaseDraft(record, { note: '', files: [] });
      notify(draft.visibility === 'internal' ? 'Internal case note added' : 'Participant update sent');
      await loadAdminData();
    });
  }

  async function resolveSupportCase(record) {
    const draft = caseDraft(record);
    const summary = String(draft.summary || draft.note || '').trim();
    if (summary.length < 5) {
      notify('Add a resolution summary');
      return;
    }
    await withAdminAction(`case-${recordId(record)}-resolve`, async () => {
      const upload = draft.files.length ? await api.uploadCargo(draft.files) : { urls: [] };
      await api.adminResolveCase(recordId(record), {
        outcome: draft.outcome,
        summary,
        evidenceUrls: upload.urls || []
      });
      notify(`${record.caseNumber || 'Case'} resolved`);
      await loadAdminData();
    });
  }

  async function reopenSupportCase(record) {
    const draft = caseDraft(record);
    await withAdminAction(`case-${recordId(record)}-reopen`, async () => {
      await api.adminReopenCase(recordId(record), {
        note: draft.note || 'Operations reopened the case for additional review'
      });
      notify(`${record.caseNumber || 'Case'} reopened`);
      await loadAdminData();
    });
  }

  function renderDocumentReview(targetType, record, expectedLabels = []) {
    const rows = documentRows(record, expectedLabels, targetType);
    if (!rows.length) return <EmptyState title="No documents" detail="Uploaded files will appear here." />;

    return (
      <div className="admin-documents">
        {rows.map((doc) => {
          const docKey = reviewNoteKey(targetType, record, doc.type);
          return (
            <div className="admin-document-row" key={doc.type}>
              <div className="admin-document-main">
                <StatusBadge tone={documentTone(doc.status)}>{documentStatusText(doc.status)}</StatusBadge>
                <strong>{formatDocumentLabel(doc.type)}</strong>
                {doc.url ? (
                  <a href={doc.url} target="_blank" rel="noreferrer">
                    View file
                  </a>
                ) : (
                  <small>Awaiting user upload</small>
                )}
                {doc.fileName ? <small>{doc.fileName}</small> : null}
                {doc.reviewedAt ? <small>Reviewed {formatDateTime(doc.reviewedAt)}</small> : null}
                {!doc.missing ? (
                  <label className="field review-note">
                    <span>Decision notes</span>
                    <textarea
                      value={reviewNotes[docKey] || ''}
                      onChange={(event) => updateReviewNote(docKey, event.target.value)}
                      placeholder="Decision notes"
                    />
                  </label>
                ) : null}
              </div>
              {doc.missing ? (
                <div className="admin-document-actions">
                  <StatusBadge>Upload needed</StatusBadge>
                </div>
              ) : (
                <div className="admin-document-actions">
                  <button
                    className="secondary"
                    type="button"
                    disabled={busyAction === `${targetType}-${recordId(record)}-${doc.type}-approved`}
                    onClick={() => reviewDocument(targetType, record, doc, 'approved')}
                  >
                    Approve
                  </button>
                  <button
                    className="secondary danger-action"
                    type="button"
                    disabled={busyAction === `${targetType}-${recordId(record)}-${doc.type}-rejected`}
                    onClick={() => reviewDocument(targetType, record, doc, 'rejected')}
                  >
                    Reject
                  </button>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busyAction === `${targetType}-${recordId(record)}-${doc.type}-expired`}
                    onClick={() => reviewDocument(targetType, record, doc, 'expired')}
                  >
                    Expire
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderDocumentArchive(record, expectedLabels = []) {
    const rows = documentRows(record, expectedLabels);
    if (!rows.length) return null;

    return (
      <div className="admin-document-archive">
        {rows.map((doc) => (
          <span key={doc.type}>
            <StatusBadge tone={documentTone(doc.status)}>{documentStatusText(doc.status)}</StatusBadge>
            {doc.url ? (
              <a href={doc.url} target="_blank" rel="noreferrer">
                {formatDocumentLabel(doc.type)}
              </a>
            ) : (
              formatDocumentLabel(doc.type)
            )}
          </span>
        ))}
      </div>
    );
  }

  function renderKycReview() {
    if (!kycUsers.length) return <EmptyState title="No KYC reviews" detail="New uploads will appear here." />;

    return (
      <div className="admin-review-list">
        {kycUsers.map((user) => {
          const expected = expectedProfileDocuments(user);
          const missing = missingRequiredDocuments(user, expected);
          const key = reviewNoteKey('user', user);
          return (
            <article className="admin-review-row" key={recordId(user)}>
              <div className="admin-review-summary">
                <div>
                  <StatusBadge tone={user.isVerified ? 'success' : missing.length ? 'danger' : 'warn'}>
                    {user.isVerified ? 'Verified' : missing.length ? `${missing.length} missing` : 'Needs review'}
                  </StatusBadge>
                  <h3>{personName(user)}</h3>
                  <div className="admin-review-meta">
                    <span>{roleLabel(user.role)}</span>
                    <span>{user.email}</span>
                    <span>{user.phone || 'Phone pending'}</span>
                  </div>
                </div>
                <div className="admin-action-row">
                  <button
                    className="primary"
                    type="button"
                    disabled={Boolean(missing.length) || busyAction === `profile-${recordId(user)}-approve`}
                    onClick={() => approveProfile(user)}
                  >
                    Approve Profile
                  </button>
                  <button
                    className="secondary danger-action"
                    type="button"
                    disabled={busyAction === `profile-${recordId(user)}-hold`}
                    onClick={() => holdProfile(user)}
                  >
                    Hold
                  </button>
                  <button
                    className="ghost danger-action"
                    type="button"
                    disabled={busyAction === `profile-${recordId(user)}-delete`}
                    onClick={() => deleteProfile(user, missing.length ? 'suspicious' : 'duplicate')}
                  >
                    Delete Profile
                  </button>
                </div>
              </div>
              <label className="field review-note">
                <span>Profile decision notes</span>
                <textarea
                  value={reviewNotes[key] || ''}
                  onChange={(event) => updateReviewNote(key, event.target.value)}
                  placeholder="Decision notes"
                />
              </label>
              {renderDocumentReview('user', user, expected)}
            </article>
          );
        })}
      </div>
    );
  }

  function renderTruckReview() {
    if (!truckReviewItems.length)
      return <EmptyState title="No truck reviews" detail="New truck uploads will appear here." />;

    return (
      <div className="admin-review-list">
        {truckReviewItems.map((truck) => {
          const expected = expectedTruckDocuments();
          const missing = missingRequiredDocuments(truck, expected);
          const photoCount = Array.isArray(truck.photos) ? truck.photos.length : 0;
          const duplicate = hasDuplicatePlate(truck);
          const key = reviewNoteKey('truck', truck);
          return (
            <article className="admin-review-row" key={recordId(truck)}>
              <div className="admin-review-summary">
                <div>
                  <StatusBadge
                    tone={truck.isVerified ? 'success' : duplicate || missing.length || !photoCount ? 'danger' : 'warn'}
                  >
                    {truck.isVerified ? 'Verified' : duplicate ? 'Duplicate plate' : 'Needs review'}
                  </StatusBadge>
                  <h3>
                    {plateKey(truck) || 'Plate pending'} - {truckName(truck)}
                  </h3>
                  <div className="admin-review-meta">
                    <span>{ownerNameForTruck(truck)}</span>
                    <span>{truck.type || 'Vehicle type pending'}</span>
                    <span>{truck.capacityTonnes ? `${truck.capacityTonnes} tonnes` : 'Capacity pending'}</span>
                    <span>
                      {photoCount} photo{photoCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
                <div className="admin-action-row">
                  <button
                    className="primary"
                    type="button"
                    disabled={
                      duplicate ||
                      !photoCount ||
                      Boolean(missing.length) ||
                      busyAction === `truck-${recordId(truck)}-approve`
                    }
                    onClick={() => approveTruck(truck)}
                  >
                    Approve Truck
                  </button>
                  <button
                    className="secondary danger-action"
                    type="button"
                    disabled={busyAction === `truck-${recordId(truck)}-hold`}
                    onClick={() => holdTruck(truck)}
                  >
                    Hold
                  </button>
                </div>
              </div>
              <div className="admin-photo-strip">
                {photoCount ? (
                  truck.photos.slice(0, 4).map((photo, index) => (
                    <a href={photo} target="_blank" rel="noreferrer" key={photo}>
                      Photo {index + 1}
                    </a>
                  ))
                ) : (
                  <span>Vehicle photos missing</span>
                )}
              </div>
              <label className="field review-note">
                <span>Truck decision notes</span>
                <textarea
                  value={reviewNotes[key] || ''}
                  onChange={(event) => updateReviewNote(key, event.target.value)}
                  placeholder="Decision notes"
                />
              </label>
              {renderDocumentReview('truck', truck, expected)}
            </article>
          );
        })}
      </div>
    );
  }

  function renderShipmentDocumentReview() {
    if (!bookingDocumentReviewItems.length)
      return <EmptyState title="No shipment document reviews" detail="Uploaded shipment files will appear here." />;

    return (
      <div className="admin-review-list">
        {bookingDocumentReviewItems.map((booking) => (
          <article className="admin-review-row" key={recordId(booking)}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone="warn">Shipment docs</StatusBadge>
                <h3>{adminBookingRef(booking)}</h3>
                <div className="admin-review-meta">
                  <span>{adminBookingRoute(booking)}</span>
                  <span>{statusLabel(adminBookingStatus(booking))}</span>
                  <span>
                    {documentList(booking).length} document{documentList(booking).length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            </div>
            {renderDocumentReview('booking', booking, [])}
          </article>
        ))}
      </div>
    );
  }

  function renderApprovedProfiles() {
    if (!approvedUsers.length)
      return <EmptyState title="No approved profiles" detail="Approved shippers and owners will appear here." />;

    return (
      <div className="admin-review-list">
        {approvedUsers.map((user) => {
          const key = reviewNoteKey('user', user);
          return (
            <article className="admin-review-row compact" key={recordId(user)}>
              <div className="admin-review-summary">
                <div>
                  <StatusBadge tone="success">Approved</StatusBadge>
                  <h3>{personName(user)}</h3>
                  <div className="admin-review-meta">
                    <span>{roleLabel(user.role)}</span>
                    <span>{user.email}</span>
                    <span>{user.phone || 'Phone pending'}</span>
                  </div>
                </div>
                <div className="admin-action-row">
                  <button
                    className="ghost danger-action"
                    type="button"
                    disabled={busyAction === `profile-${recordId(user)}-delete`}
                    onClick={() => deleteProfile(user, 'duplicate')}
                  >
                    Delete Profile
                  </button>
                </div>
              </div>
              <label className="field review-note">
                <span>Deletion reason</span>
                <textarea
                  value={reviewNotes[key] || ''}
                  onChange={(event) => updateReviewNote(key, event.target.value)}
                  placeholder="Why should this profile be removed?"
                />
              </label>
              {renderDocumentArchive(user, expectedProfileDocuments(user))}
            </article>
          );
        })}
      </div>
    );
  }

  function renderApprovedTrucks() {
    if (!approvedTrucks.length)
      return <EmptyState title="No approved trucks" detail="Approved fleet records will appear here." />;

    return (
      <div className="admin-review-list">
        {approvedTrucks.map((truck) => (
          <article className="admin-review-row compact" key={recordId(truck)}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone="success">Approved</StatusBadge>
                <h3>
                  {plateKey(truck) || 'Plate pending'} - {truckName(truck)}
                </h3>
                <div className="admin-review-meta">
                  <span>{ownerNameForTruck(truck)}</span>
                  <span>{truck.type || 'Vehicle type pending'}</span>
                  <span>{truck.capacityTonnes ? `${truck.capacityTonnes} tonnes` : 'Capacity pending'}</span>
                </div>
              </div>
            </div>
            {renderDocumentArchive(truck, expectedTruckDocuments())}
          </article>
        ))}
      </div>
    );
  }

  function renderDelayReview() {
    if (!delayedBookings.length)
      return <EmptyState title="No route delays" detail="Delayed shipments will appear here." />;

    return (
      <div className="admin-review-list">
        {delayedBookings.map((booking) => (
          <article className="admin-review-row" key={adminBookingRef(booking)}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone="warn">{statusLabel(adminBookingStatus(booking))}</StatusBadge>
                <h3>{adminBookingRef(booking)}</h3>
                <p>{adminBookingRoute(booking)}</p>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={busyAction === 'delay'}
                onClick={() => runAdminOperation('delay')}
              >
                Queue Follow-up
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderEscrowReview() {
    if (!releaseReadyBookings.length)
      return <EmptyState title="No escrow releases" detail="Delivered escrow bookings will appear here." />;

    return (
      <div className="admin-review-list">
        {releaseReadyBookings.map((booking) => (
          <article className="admin-review-row" key={adminBookingRef(booking)}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone="success">{statusLabel(booking.paymentStatus || 'escrowed')}</StatusBadge>
                <h3>{adminBookingRef(booking)}</h3>
                <p>{adminBookingRoute(booking)}</p>
                <div className="admin-review-meta">
                  <span>{money(bookingAmount(booking))}</span>
                  <span>{statusLabel(adminBookingStatus(booking))}</span>
                </div>
              </div>
              <button
                className="primary"
                type="button"
                disabled={busyAction === 'escrow'}
                onClick={() => runAdminOperation('escrow')}
              >
                Release Payment
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderDuplicateReview() {
    if (!duplicateProfileGroups.length && !duplicatePlateGroups.length)
      return (
        <EmptyState title="No duplicate profiles or plates" detail="Profile and vehicle conflicts will appear here." />
      );

    return (
      <div className="admin-review-list">
        {duplicateProfileGroups.map(([groupKey, users]) => (
          <article className="admin-review-row" key={groupKey}>
            <StatusBadge tone="danger">{users.length} profiles</StatusBadge>
            <h3>{groupKey}</h3>
            <div className="admin-documents">
              {users.map((user) => {
                const key = reviewNoteKey('user', user);
                return (
                  <div className="admin-document-row" key={recordId(user)}>
                    <div className="admin-document-main">
                      <strong>{personName(user)}</strong>
                      <small>
                        {roleLabel(user.role)} - {user.email}
                      </small>
                      <label className="field review-note compact-review-note">
                        <span>Deletion reason</span>
                        <textarea
                          value={reviewNotes[key] || ''}
                          onChange={(event) => updateReviewNote(key, event.target.value)}
                          placeholder="Why should this duplicate profile be removed?"
                        />
                      </label>
                    </div>
                    <button
                      className="ghost danger-action"
                      type="button"
                      disabled={busyAction === `profile-${recordId(user)}-delete`}
                      onClick={() => deleteProfile(user, 'duplicate')}
                    >
                      Delete Profile
                    </button>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
        {duplicatePlateGroups.map(([plate, trucks]) => (
          <article className="admin-review-row" key={plate}>
            <StatusBadge tone="danger">{trucks.length} listings</StatusBadge>
            <h3>{plate}</h3>
            <div className="admin-documents">
              {trucks.map((truck) => (
                <div className="admin-document-row" key={recordId(truck)}>
                  <div className="admin-document-main">
                    <strong>{truckName(truck)}</strong>
                    <small>{ownerNameForTruck(truck)}</small>
                  </div>
                  <button className="secondary danger-action" type="button" onClick={() => holdTruck(truck)}>
                    Hold Listing
                  </button>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderPaymentReview() {
    return (
      <div className="admin-review-list">
        {releaseReadyBookings.length ? renderEscrowReview() : null}
        {adminData.payments.slice(0, 8).map((payment, index) => (
          <article className="admin-review-row" key={payment._id || payment.id || index}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone={payment.status === 'completed' || payment.status === 'paid' ? 'success' : 'warn'}>
                  {statusLabel(payment.status || 'pending')}
                </StatusBadge>
                <h3>{payment.method || payment.provider || 'Payment record'}</h3>
                <p>{money(payment.amount || 0, payment.currency || 'USD')}</p>
              </div>
            </div>
          </article>
        ))}
        {!releaseReadyBookings.length && !adminData.payments.length ? (
          <EmptyState title="No payment records" detail="Payment reviews will appear here." />
        ) : null}
      </div>
    );
  }

  function renderNotificationDeliveryReview() {
    if (!adminData.notificationDeliveries.length) {
      return <EmptyState title="No delivery records" detail="Email and SMS attempts will appear here." />;
    }

    return (
      <div className="admin-review-list">
        {adminData.notificationDeliveries.slice(0, 100).map((delivery) => (
          <article className="admin-review-row" key={recordId(delivery)}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge
                  tone={
                    delivery.status === 'sent'
                      ? 'success'
                      : delivery.status === 'failed'
                        ? 'danger'
                        : delivery.status === 'retry'
                          ? 'warn'
                          : 'default'
                  }
                >
                  {statusLabel(delivery.status)}
                </StatusBadge>
                <h3>{delivery.notification?.title || `${String(delivery.channel).toUpperCase()} notification`}</h3>
                <p>
                  {delivery.user
                    ? `${personName(delivery.user)} - ${delivery.channel}`
                    : `${delivery.recipient || 'Recipient unavailable'} - ${delivery.channel}`}
                </p>
                <small>
                  Attempts {delivery.attempts}/{delivery.maxAttempts}
                  {delivery.lastError ? ` - ${delivery.lastError}` : ''}
                </small>
              </div>
              {delivery.status === 'failed' ? (
                <button
                  className="secondary"
                  type="button"
                  disabled={busyAction === `delivery-${recordId(delivery)}`}
                  onClick={() =>
                    withAdminAction(`delivery-${recordId(delivery)}`, async () => {
                      await api.adminRetryNotificationDelivery(recordId(delivery));
                      notify('Notification delivery queued for retry');
                      await loadAdminData();
                    })
                  }
                >
                  Retry
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderCaseReview() {
    if (!adminData.cases.length) {
      return <EmptyState title="No support cases" detail="Shipment support and dispute cases will appear here." />;
    }
    const admins = adminData.users.filter((record) => record.role === 'admin' && record.isActive !== false);

    return (
      <div className="admin-review-list">
        {adminData.cases.map((record) => {
          const draft = caseDraft(record);
          const resolved = ['resolved', 'dismissed'].includes(record.status);
          const closed = record.status === 'closed';
          const breached = Boolean(record.firstResponseBreachedAt || record.resolutionBreachedAt);
          const availableStatuses = ['triaged', 'in_progress', 'waiting_on_user', 'waiting_on_carrier'];
          const selectedManagementStatus = availableStatuses.includes(draft.status)
            ? draft.status
            : availableStatuses[0];
          const outcomes =
            record.kind === 'dispute'
              ? [
                  ['resume_booking', 'Resume booking'],
                  ['cancel_booking', 'Cancel booking'],
                  ['confirm_delivery', 'Confirm delivery'],
                  ['refund_required', 'Cancel + refund required']
                ]
              : [
                  ['no_action', 'Resolved - no booking change'],
                  ['dismissed', 'Dismiss case']
                ];

          return (
            <article
              className={`admin-review-row case-review-card ${breached ? 'sla-breached' : ''}`}
              key={recordId(record)}
            >
              <div className="admin-review-summary">
                <div>
                  <div className="case-badge-row">
                    <StatusBadge tone={breached ? 'danger' : record.priority === 'urgent' ? 'danger' : 'warn'}>
                      {statusLabel(record.priority || 'normal')}
                    </StatusBadge>
                    <StatusBadge tone={resolved || closed ? 'success' : 'default'}>
                      {statusLabel(record.status)}
                    </StatusBadge>
                    <StatusBadge tone={record.kind === 'dispute' ? 'danger' : 'default'}>
                      {statusLabel(record.kind)}
                    </StatusBadge>
                  </div>
                  <h3>
                    {record.caseNumber || recordId(record)} - {record.title || statusLabel(record.category)}
                  </h3>
                  <p>{record.message}</p>
                  <div className="admin-review-meta">
                    <span>
                      Reporter:{' '}
                      {[record.user?.firstName, record.user?.lastName].filter(Boolean).join(' ') ||
                        record.user?.email ||
                        'Unknown'}
                    </span>
                    <span>
                      Booking:{' '}
                      {record.booking
                        ? `${record.booking.pickup || 'Pickup'} to ${record.booking.destination || 'destination'}`
                        : 'General support'}
                    </span>
                    <span>Escalation {record.escalationLevel || 0}</span>
                    <span>
                      Due:{' '}
                      {record.resolutionDueAt
                        ? new Date(record.resolutionDueAt).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })
                        : 'Not set'}
                    </span>
                  </div>
                </div>
              </div>

              {(record.evidence || []).length ? (
                <div className="case-evidence-links">
                  {record.evidence.map((item, index) => (
                    <a href={item.url} target="_blank" rel="noreferrer" key={item._id || item.url}>
                      {item.fileName || `Evidence ${index + 1}`}
                    </a>
                  ))}
                </div>
              ) : null}

              {!resolved && !closed ? (
                <div className="case-control-grid">
                  <label className="field">
                    <span>Assignee</span>
                    <select
                      value={draft.assignedTo}
                      onChange={(event) => updateCaseDraft(record, { assignedTo: event.target.value })}
                    >
                      <option value="">Unassigned</option>
                      {admins.map((admin) => (
                        <option value={recordId(admin)} key={recordId(admin)}>
                          {personName(admin)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busyAction === `case-${recordId(record)}-assign`}
                    onClick={() => assignSupportCase(record)}
                  >
                    Assign
                  </button>
                  <label className="field">
                    <span>Status</span>
                    <select
                      value={selectedManagementStatus}
                      onChange={(event) => updateCaseDraft(record, { status: event.target.value })}
                    >
                      {availableStatuses.map((status) => (
                        <option value={status} key={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="secondary"
                    type="button"
                    disabled={busyAction === `case-${recordId(record)}-status`}
                    onClick={() => updateSupportCaseStatus(record, selectedManagementStatus)}
                  >
                    Update status
                  </button>
                </div>
              ) : null}

              <label className="field review-note">
                <span>Case note or participant update</span>
                <textarea
                  value={draft.note}
                  disabled={closed}
                  onChange={(event) => updateCaseDraft(record, { note: event.target.value })}
                  placeholder="Record findings, request evidence, or update the participants"
                />
              </label>
              <div className="admin-action-row">
                <select
                  value={draft.visibility}
                  disabled={closed}
                  onChange={(event) => updateCaseDraft(record, { visibility: event.target.value })}
                >
                  <option value="participants">Visible to participants</option>
                  <option value="internal">Internal note</option>
                </select>
                <button
                  className="secondary"
                  type="button"
                  disabled={closed || busyAction === `case-${recordId(record)}-comment`}
                  onClick={() => commentOnSupportCase(record)}
                >
                  Add update
                </button>
              </div>

              {(record.comments || []).length ? (
                <div className="case-comment-thread admin-case-thread">
                  {record.comments.slice(-5).map((comment) => (
                    <div
                      className={`case-comment ${comment.visibility === 'internal' ? 'internal' : ''}`}
                      key={comment._id}
                    >
                      <strong>
                        {[comment.author?.firstName, comment.author?.lastName].filter(Boolean).join(' ') ||
                          comment.author?.email ||
                          'Operations'}
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
                      <small>
                        {statusLabel(comment.visibility)} - {comment.createdAt ? formatDateTime(comment.createdAt) : ''}
                      </small>
                    </div>
                  ))}
                </div>
              ) : null}

              {(record.timeline || []).length ? (
                <div className="case-timeline">
                  {record.timeline.slice(-6).map((event) => (
                    <div key={event._id || `${event.action}-${event.createdAt}`}>
                      <strong>{statusLabel(event.action?.replaceAll('.', '_') || 'case update')}</strong>
                      <span>{event.note || `${statusLabel(event.fromStatus)} to ${statusLabel(event.toStatus)}`}</span>
                      <small>{event.createdAt ? formatDateTime(event.createdAt) : ''}</small>
                    </div>
                  ))}
                </div>
              ) : null}

              {!closed ? (
                <label className="case-file-input">
                  <span>Evidence for the next update or resolution</span>
                  <input
                    type="file"
                    accept={documentUploadAccept}
                    multiple
                    onChange={(event) =>
                      updateCaseDraft(record, { files: Array.from(event.target.files || []).slice(0, 10) })
                    }
                  />
                  <small>
                    {draft.files.length
                      ? `${draft.files.length} file${draft.files.length === 1 ? '' : 's'} selected`
                      : 'Optional'}
                  </small>
                </label>
              ) : null}

              {!closed && !resolved ? (
                <div className="case-resolution-box">
                  <label className="field">
                    <span>Resolution outcome</span>
                    <select
                      value={draft.outcome}
                      onChange={(event) => updateCaseDraft(record, { outcome: event.target.value })}
                    >
                      {outcomes.map(([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Resolution summary</span>
                    <textarea
                      value={draft.summary}
                      onChange={(event) => updateCaseDraft(record, { summary: event.target.value })}
                      placeholder="Decision, evidence reviewed, and next operational step"
                    />
                  </label>
                  <button
                    className="primary"
                    type="button"
                    disabled={busyAction === `case-${recordId(record)}-resolve`}
                    onClick={() => resolveSupportCase(record)}
                  >
                    Resolve case
                  </button>
                </div>
              ) : resolved ? (
                <div className="case-resolution-box">
                  <strong>{statusLabel(record.resolution?.outcome || record.status)}</strong>
                  <p>{record.resolution?.summary || 'Case resolution recorded.'}</p>
                  {(record.resolution?.evidenceUrls || []).length ? (
                    <div className="case-evidence-links">
                      {record.resolution.evidenceUrls.map((url, index) => (
                        <a href={url} target="_blank" rel="noreferrer" key={url}>
                          Resolution evidence {index + 1}
                        </a>
                      ))}
                    </div>
                  ) : null}
                  <button
                    className="secondary"
                    type="button"
                    disabled={busyAction === `case-${recordId(record)}-reopen`}
                    onClick={() => reopenSupportCase(record)}
                  >
                    Reopen
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    );
  }

  function renderHighValueReview() {
    if (!highValueBookings.length)
      return <EmptyState title="No high-value cargo" detail="High-value bookings will appear here." />;

    return (
      <div className="admin-review-list">
        {highValueBookings.map((booking) => (
          <article className="admin-review-row" key={adminBookingRef(booking)}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone="warn">{money(bookingAmount(booking))}</StatusBadge>
                <h3>{adminBookingRef(booking)}</h3>
                <p>{adminBookingRoute(booking)}</p>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={busyAction === `high-value-${adminBookingRef(booking)}`}
                onClick={() => queueHighValueReview(booking)}
              >
                Record Review
              </button>
            </div>
          </article>
        ))}
      </div>
    );
  }

  function renderExpiryReview() {
    if (!expiredDocumentReviews.length)
      return <EmptyState title="No expired documents" detail="Expired document alerts will appear here." />;

    return (
      <div className="admin-review-list">
        {expiredDocumentReviews.map(({ targetType, record, doc }) => (
          <article className="admin-review-row" key={`${targetType}-${recordId(record)}-${doc.type}`}>
            <div className="admin-review-summary">
              <div>
                <StatusBadge tone="danger">Expired</StatusBadge>
                <h3>{formatDocumentLabel(doc.type)}</h3>
                <p>
                  {targetType === 'truck'
                    ? `${plateKey(record)} - ${ownerNameForTruck(record)}`
                    : targetType === 'booking'
                      ? `${adminBookingRef(record)} - ${adminBookingRoute(record)}`
                      : personName(record)}
                </p>
              </div>
            </div>
            {renderDocumentReview(targetType, record, [])}
          </article>
        ))}
      </div>
    );
  }

  function renderRiskReview() {
    return (
      <div className="admin-review-list">
        <div className="admin-risk-grid">
          {riskItems.map((item) => (
            <button
              className={activeReview === item.key ? 'active' : ''}
              type="button"
              key={item.key}
              onClick={() => setActiveReview(item.key)}
            >
              <strong>{item.label}</strong>
              <span>{item.count}</span>
            </button>
          ))}
        </div>
        {duplicatePlateGroups.length ||
        duplicateProfileGroups.length ||
        highValueBookings.length ||
        expiredDocumentReviews.length ||
        delayedBookings.length ? (
          <div className="admin-review-row compact">
            <StatusBadge tone="warn">Open risk work</StatusBadge>
            <div className="admin-review-meta">
              <span>{duplicateProfileGroups.length} duplicate profile groups</span>
              <span>{duplicatePlateGroups.length} duplicate plate groups</span>
              <span>{highValueBookings.length} high-value bookings</span>
              <span>{expiredDocumentReviews.length} expired documents</span>
              <span>{delayedBookings.length} route exceptions</span>
            </div>
          </div>
        ) : (
          <EmptyState title="No risk work" detail="Risk checks that need action will appear here." />
        )}
      </div>
    );
  }

  const reviewTitles = {
    kyc: 'KYC Review Queue',
    trucks: 'Truck Review Queue',
    shipments: 'Shipment Document Review',
    'approved-profiles': 'Approved Profiles',
    'approved-trucks': 'Approved Trucks',
    risk: 'Risk Overview',
    delay: 'Route Exceptions',
    escrow: 'Escrow Release',
    duplicates: 'Duplicate Listings',
    payments: 'Payment Releases',
    notifications: 'Notification Delivery Queue',
    cases: 'Support And Dispute Cases',
    'high-value': 'High-value Cargo',
    expiry: 'Document Expiry'
  };

  function renderActiveReview() {
    if (activeReview === 'kyc') return renderKycReview();
    if (activeReview === 'trucks') return renderTruckReview();
    if (activeReview === 'shipments') return renderShipmentDocumentReview();
    if (activeReview === 'approved-profiles') return renderApprovedProfiles();
    if (activeReview === 'approved-trucks') return renderApprovedTrucks();
    if (activeReview === 'risk') return renderRiskReview();
    if (activeReview === 'delay') return renderDelayReview();
    if (activeReview === 'escrow') return renderEscrowReview();
    if (activeReview === 'duplicates') return renderDuplicateReview();
    if (activeReview === 'payments') return renderPaymentReview();
    if (activeReview === 'notifications') return renderNotificationDeliveryReview();
    if (activeReview === 'cases') return renderCaseReview();
    if (activeReview === 'high-value') return renderHighValueReview();
    if (activeReview === 'expiry') return renderExpiryReview();
    return renderKycReview();
  }

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard icon={ShieldCheck} label="Users" value={stats?.totalUsers ?? 0} detail="Registered accounts" />
        <MetricCard icon={Truck} label="Trucks" value={stats?.totalTrucks ?? 0} detail="Registered vehicles" />
        <MetricCard
          icon={CreditCard}
          label="Revenue"
          value={money(stats?.totalRevenue || 0)}
          detail="Completed transactions"
        />
        <MetricCard icon={FileText} label="Bookings" value={stats?.totalBookings ?? 0} detail="Shipment records" />
      </section>
      <section className="admin-console">
        <Panel title="Approvals Console" eyebrow="Admin Desk">
          <div className="admin-console-shell">
            <nav className="admin-tab-list" aria-label="Admin review queues">
              {adminTabs.map((item) => (
                <button
                  className={
                    activeReview === item.key ||
                    (item.key === 'risk' && ['duplicates', 'high-value', 'expiry', 'delay'].includes(activeReview))
                      ? 'active'
                      : ''
                  }
                  type="button"
                  key={item.key}
                  onClick={() => setActiveReview(item.key)}
                >
                  <span>{item.label}</span>
                  <StatusBadge tone={item.tone}>{item.count}</StatusBadge>
                </button>
              ))}
            </nav>
            <div className="admin-review-desk">
              <div className="admin-review-header">
                <div>
                  <p className="eyebrow">Review Desk</p>
                  <h2>{reviewTitles[activeReview] || 'Review'}</h2>
                </div>
                <button
                  className="secondary compact-button"
                  type="button"
                  disabled={busyAction === 'refresh'}
                  onClick={refreshAdminData}
                >
                  {busyAction === 'refresh' ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
              {renderActiveReview()}
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
