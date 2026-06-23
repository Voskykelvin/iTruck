import { useState, useEffect, useRef, useCallback } from 'react';
import { Image, ShieldCheck } from 'lucide-react';
import io from 'socket.io-client';
import { api, setSession } from '../api.js';
import { demoFleet, demoShipments } from '../data.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import DocumentSlotButton from '../components/DocumentSlotButton.jsx';
import { usePollingEffect } from '../hooks/usePolling.js';
import {
  roleForUser,
  roleName,
  profileDocumentsForRole,
  normalizeBookingShipment,
  normalizeTruck,
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

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceShipments = DEMO_MODE ? demoShipments : [];

export default function DocumentsPage({ notify, user, setUser }) {
  const role = roleForUser(user);
  const [shipments, setShipments] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [busy, setBusy] = useState('');
  const pendingUploadRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketRef = useRef(null);
  const bookingIdsRef = useRef([]);
  const profileDocs = profileDocumentsForRole(role);

  const refreshDocuments = useCallback(async () => {
    try {
      const data = await api.listBookings();
      if (Array.isArray(data.bookings)) setShipments(data.bookings.map(normalizeBookingShipment));
    } catch (_err) {
      setShipments(workspaceShipments);
    }

    if (role === 'owner') {
      try {
        const data = await api.fleetTrucks();
        if (Array.isArray(data.trucks)) setFleet(data.trucks.map(normalizeTruck));
      } catch (_err) {
        setFleet(workspaceFleet.slice(0, 2));
      }
    }
  }, [role]);

  useEffect(() => {
    refreshDocuments();
  }, [refreshDocuments]);

  usePollingEffect(Boolean(user.email), refreshDocuments, 30000);

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
      await api.downloadDocument(definition.type, shipment.bookingId);
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
        const data = await api.uploadProfileDocument(pending.documentType, file);
        if (data.user) {
          setSession({ user: data.user });
          setUser(data.user);
        }
      } else if (pending.targetType === 'truck') {
        if (pending.documentType === 'vehicle-photos') {
          const data = await api.uploadTruckPhoto(pending.targetId, file);
          if (data.truck) {
            const updated = normalizeTruck(data.truck);
            setFleet((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          }
        } else {
          await api.uploadTruckDocument(pending.targetId, pending.documentType, file);
          api
            .fleetTrucks()
            .then((data) => Array.isArray(data.trucks) && setFleet(data.trucks.map(normalizeTruck)))
            .catch(() => {});
        }
      } else {
        const data = await api.uploadBookingDocument(
          pending.targetId,
          normalizeBookingDocumentType(pending.documentType),
          file
        );
        if (data.booking) {
          const updated = normalizeBookingShipment(data.booking);
          setShipments((current) => current.map((item) => (item.bookingId === updated.bookingId ? updated : item)));
        }
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
            <div className="doc-list">
              {profileDocs.map((item) => {
                const slug = normalizeProfileDocumentType(item, role);
                const existingDoc = findProfileDocument(user.documents || [], item, role);
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
            {role === 'owner'
              ? fleet.map((truck) => (
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
              : renderShipmentDocumentCards()}
            {role === 'owner' && !fleet.length ? (
              <EmptyState
                title="No vehicles yet"
                detail="Register a vehicle first so admin can review its documents."
              />
            ) : null}
            {role !== 'owner' && !shipments.length ? (
              <EmptyState title="No shipment documents" detail="Create a booking to generate shipment paperwork." />
            ) : null}
          </div>
        </Panel>
        {role === 'owner' ? (
          <Panel title="Job Handover Documents" eyebrow="Shipment Evidence">
            <div className="cards-grid">
              {renderShipmentDocumentCards()}
              {!shipments.length ? (
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
