import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Image, ShieldCheck } from 'lucide-react';
import io from 'socket.io-client';
import { api, setSession } from '../api.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import DocumentSlotButton from '../components/DocumentSlotButton.jsx';
import AsyncState from '../components/AsyncState.jsx';
import { usePollingEffect } from '../hooks/usePolling.js';
import { useBookings, useFleetTrucks } from '../queries/commercial.js';
import { useDocumentAction, useDownloadDocument } from '../queries/documents.js';
import { useProfile } from '../queries/operations.js';
import {
  roleForUser,
  roleName,
  profileDocumentsForRole,
  normalizeProfileDocumentType,
  findProfileDocument,
  normalizeBookingDocumentType,
  normalizeTruckDocumentType,
  findTruckDocument,
  handoverDocumentActionsFor,
  shipmentDocumentStatus,
  documentUploadAccept,
  documentUploadLimitText,
  ownerVehicleDocuments,
  navigate
} from '../utils/helpers.js';

export default function DocumentsPage({ notify, user, setUser }) {
  const role = roleForUser(user);
  const [busy, setBusy] = useState('');
  const pendingUploadRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const bookingIdsRef = useRef([]);
  const profileDocs = profileDocumentsForRole(role);
  const bookingsQuery = useBookings({ enabled: Boolean(user.email) });
  const fleetQuery = useFleetTrucks({ enabled: Boolean(user.email) && role === 'owner' });
  const profileQuery = useProfile(user, { enabled: Boolean(user.email) });
  const profileUpload = useDocumentAction(({ documentType, file }) => api.uploadProfileDocument(documentType, file));
  const truckUpload = useDocumentAction(({ truckId, documentType, file }) =>
    api.uploadTruckDocument(truckId, documentType, file)
  );
  const truckPhotoUpload = useDocumentAction(({ truckId, file }) => api.uploadTruckPhoto(truckId, file));
  const bookingUpload = useDocumentAction(({ bookingId, documentType, file }) =>
    api.uploadBookingDocument(bookingId, documentType, file)
  );
  const documentDownload = useDownloadDocument();
  const shipments = useMemo(() => bookingsQuery.data || [], [bookingsQuery.data]);
  const fleet = fleetQuery.data || [];
  const profileUser = profileQuery.data || user;
  const refetchBookings = bookingsQuery.refetch;
  const refetchFleet = fleetQuery.refetch;
  const refetchProfile = profileQuery.refetch;

  const refreshDocuments = useCallback(async () => {
    const requests = [refetchBookings(), refetchProfile()];
    if (role === 'owner') requests.push(refetchFleet());
    await Promise.allSettled(requests);
  }, [refetchBookings, refetchFleet, refetchProfile, role]);

  usePollingEffect(Boolean(user.email), refreshDocuments, 30000);

  useEffect(() => {
    if (!profileQuery.data || profileQuery.data === user) return;
    setSession({ user: profileQuery.data });
    setUser(profileQuery.data);
  }, [profileQuery.data, setUser, user]);

  useEffect(() => {
    const socket = io(window.location.origin, {
      withCredentials: true
    });
    socketRef.current = socket;
    socket.on('document:updated', refreshDocuments);
    socket.on('document-updated', refreshDocuments);
    socket.on('connect', () => {
      bookingIdsRef.current.forEach((bookingId) => socket.emit('join-booking', bookingId));
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [refreshDocuments]);

  useEffect(() => {
    const bookingIds = shipments.map((shipment) => shipment.bookingId).filter(Boolean);
    bookingIdsRef.current = bookingIds;
    bookingIds.forEach((bookingId) => socketRef.current?.emit('join-booking', bookingId));
  }, [shipments]);

  async function downloadDoc(definition, shipment) {
    if (!shipment?.bookingId) {
      notify('Document needs a synced booking');
      return;
    }

    setBusy(`${shipment.bookingId}-${definition.type}`);
    try {
      await documentDownload.mutateAsync({ type: definition.type, bookingId: shipment.bookingId });
      notify(`${definition.label} downloaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  function openUpload(targetType, targetId, documentType) {
    pendingUploadRef.current = { targetType, targetId, documentType };
    fileInputRef.current?.click();
  }

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const pending = pendingUploadRef.current;
    if (!file || !pending) return;

    setBusy(`${pending.targetId}-${pending.documentType}`);
    try {
      if (pending.targetType === 'profile') {
        const data = await profileUpload.mutateAsync({ documentType: pending.documentType, file });
        if (data.user) {
          setSession({ user: data.user });
          setUser(data.user);
        }
      } else if (pending.targetType === 'truck') {
        if (pending.documentType === 'vehicle-photos') {
          await truckPhotoUpload.mutateAsync({ truckId: pending.targetId, file });
        } else {
          await truckUpload.mutateAsync({
            truckId: pending.targetId,
            documentType: pending.documentType,
            file
          });
        }
      } else {
        await bookingUpload.mutateAsync({
          bookingId: pending.targetId,
          documentType: normalizeBookingDocumentType(pending.documentType),
          file
        });
      }
      notify('Document sent to admin review');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  function renderShipmentDocumentCards() {
    return shipments.map((shipment) => (
      <article className="quote-card" key={shipment.id}>
        <StatusBadge>{shipment.status}</StatusBadge>
        <h3>{shipment.id}</h3>
        <p>{shipment.route}</p>
        <div className="doc-list compact">
          {handoverDocumentActionsFor(shipment).map((definition) => (
            <DocumentSlotButton
              key={definition.type}
              label={definition.label}
              status={definition.mode === 'upload' ? shipmentDocumentStatus(shipment, definition.type) : 'missing'}
              busy={busy === `${shipment.bookingId}-${definition.type}`}
              busyText={definition.mode === 'upload' ? 'Uploading...' : 'Opening...'}
              disabled={busy === `${shipment.bookingId}-${definition.type}` || !shipment.bookingId}
              labels={{
                missing: definition.mode === 'upload' ? 'Upload' : 'Download',
                pending: 'Review',
                approved: 'Ready'
              }}
              onClick={() =>
                definition.mode === 'upload'
                  ? openUpload('shipment', shipment.bookingId, definition.type)
                  : downloadDoc(definition, shipment)
              }
              style={{ margin: '4px 0' }}
            />
          ))}
        </div>
      </article>
    ));
  }

  return (
    <section className="workspace-layout">
      <input
        ref={fileInputRef}
        type="file"
        accept={documentUploadAccept}
        onChange={uploadDocument}
        style={{ display: 'none' }}
      />
      <div className="stack">
        {profileDocs.length ? (
          <Panel title={`${roleName(role)} Profile Documents`} eyebrow="Account Verification">
            {profileQuery.isError ? (
              <AsyncState
                compact
                title="Profile documents could not be refreshed"
                detail={profileQuery.error?.message}
                onRetry={() => profileQuery.refetch()}
              />
            ) : null}
            <div className="doc-list">
              {profileDocs.map((item) => {
                const slug = normalizeProfileDocumentType(item, role);
                const existingDoc = findProfileDocument(profileUser.documents || [], item, role);
                const docStatus = existingDoc ? existingDoc.status : 'missing';
                const isBusy = busy === `profile-${slug}`;

                return (
                  <DocumentSlotButton
                    key={item}
                    label={item}
                    status={docStatus}
                    busy={isBusy}
                    disabled={docStatus === 'approved'}
                    labels={{
                      approved: 'Verified',
                      pending: 'Under Review',
                      rejected: 'Rejected - Re-upload',
                      expired: 'Expired - Re-upload',
                      missing: 'Upload'
                    }}
                    onClick={() => openUpload('profile', 'profile', slug)}
                    title={docStatus === 'approved' ? `${item} already verified` : `Click to upload ${item}`}
                    style={{ margin: '4px 0' }}
                  />
                );
              })}
            </div>
            <p className="muted-note">
              These belong to your {roleName(role).toLowerCase()} profile. They stay separate from shipment and vehicle
              handover files.
            </p>
          </Panel>
        ) : null}
        <Panel title={role === 'owner' ? 'Fleet Documents' : 'Shipment Documents'} eyebrow="Admin Review">
          <div className="cards-grid">
            {role === 'owner' ? (
              fleetQuery.isPending ? (
                <AsyncState compact title="Loading fleet documents..." />
              ) : fleetQuery.isError ? (
                <AsyncState
                  compact
                  title="Fleet documents could not be loaded"
                  detail={fleetQuery.error?.message}
                  onRetry={() => fleetQuery.refetch()}
                />
              ) : (
                fleet.map((truck) => (
                  <article className="quote-card" key={truck.id}>
                    <StatusBadge tone={truck.verified ? 'success' : 'warn'}>{truck.documentStatus}</StatusBadge>
                    <h3>{truck.plate}</h3>
                    <p>{truck.name}</p>
                    <div style={{ display: 'grid', gap: '6px', marginTop: '8px' }}>
                      {ownerVehicleDocuments.map((item) => {
                        const slug = normalizeTruckDocumentType(item);
                        const existingDoc = findTruckDocument(truck.documents || [], item);
                        const docStatus = existingDoc ? existingDoc.status : 'missing';
                        const isBusy = busy === `${truck.id}-${slug}`;

                        return (
                          <DocumentSlotButton
                            key={item}
                            label={item}
                            status={docStatus}
                            busy={isBusy}
                            disabled={docStatus === 'approved'}
                            labels={{
                              approved: 'Verified',
                              pending: 'Under Review',
                              rejected: 'Rejected - Re-upload',
                              expired: 'Expired - Re-upload',
                              missing: 'Upload'
                            }}
                            onClick={() => openUpload('truck', truck.id, slug)}
                            title={docStatus === 'approved' ? `${item} already verified` : `Click to upload ${item}`}
                          />
                        );
                      })}
                      <button
                        type="button"
                        className="premium-upload-zone"
                        style={{ marginTop: '6px', padding: '14px' }}
                        disabled={busy.startsWith(truck.id)}
                        onClick={() => openUpload('truck', truck.id, 'vehicle-photos')}
                      >
                        <Image size={20} />
                        <span style={{ fontSize: '13px' }}>
                          {busy === `${truck.id}-vehicle-photos` ? 'Uploading…' : 'Upload Vehicle Photos'}
                        </span>
                      </button>
                    </div>
                  </article>
                ))
              )
            ) : bookingsQuery.isPending ? (
              <AsyncState compact title="Loading shipment documents..." />
            ) : bookingsQuery.isError ? (
              <AsyncState
                compact
                title="Shipment documents could not be loaded"
                detail={bookingsQuery.error?.message}
                onRetry={() => bookingsQuery.refetch()}
              />
            ) : (
              renderShipmentDocumentCards()
            )}
            {role === 'owner' && !fleetQuery.isPending && !fleetQuery.isError && !fleet.length ? (
              <EmptyState
                title="No vehicles yet"
                detail="Register a vehicle first so admin can review its documents."
              />
            ) : null}
            {role !== 'owner' && !bookingsQuery.isPending && !bookingsQuery.isError && !shipments.length ? (
              <EmptyState title="No shipment documents" detail="Create a booking to generate shipment paperwork." />
            ) : null}
          </div>
        </Panel>
        {role === 'owner' ? (
          <Panel title="Job Handover Documents" eyebrow="Shipment Evidence">
            <div className="cards-grid">
              {bookingsQuery.isPending ? (
                <AsyncState compact title="Loading job documents..." />
              ) : bookingsQuery.isError ? (
                <AsyncState
                  compact
                  title="Job documents could not be loaded"
                  detail={bookingsQuery.error?.message}
                  onRetry={() => bookingsQuery.refetch()}
                />
              ) : (
                renderShipmentDocumentCards()
              )}
              {!bookingsQuery.isPending && !bookingsQuery.isError && !shipments.length ? (
                <EmptyState
                  title="No job documents"
                  detail="Accepted jobs will show waybills, cargo evidence, POD, and receiver confirmation here."
                />
              ) : null}
            </div>
          </Panel>
        ) : null}
      </div>
      <aside className="side-stack">
        <Panel title="Verification" eyebrow="Account">
          <p className="muted-note">
            {documentUploadLimitText}. Profile and vehicle files land in the admin review queue.
          </p>
          <button className="secondary full icon-label" type="button" onClick={() => navigate('/app/onboarding')}>
            <ShieldCheck size={18} />
            <span>Open Verification</span>
          </button>
        </Panel>
      </aside>
    </section>
  );
}
