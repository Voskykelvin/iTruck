import { useState, useEffect, useRef, useCallback } from 'react';
import { Image, Truck, Plus, BarChart3, UserRound } from 'lucide-react';
import { api, setSession } from '../api.js';
import { demoFleet } from '../data.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import DocumentSlotButton from '../components/DocumentSlotButton.jsx';
import Input from '../components/Input.jsx';
import Select from '../components/Select.jsx';
import { useCurrentUserPolling, usePollingEffect } from '../hooks/usePolling.js';
import {
  roleForUser,
  roleName,
  normalizeProfileDocumentType,
  profileDocumentsForRole,
  missingRequiredProfileDocuments,
  documentStages,
  findProfileDocument,
  documentUploadAccept,
  imageUploadAccept,
  documentUploadLimitText,
  normalizeTruck,
  vehicleTypes,
  navigate
} from '../utils/helpers.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];

export default function OnboardingPage({ notify, user, setUser }) {
  const role = roleForUser(user);
  const [uploading, setUploading] = useState('');
  const [fleet, setFleet] = useState([]);
  const [truckDraft, setTruckDraft] = useState({
    plateNumber: '',
    type: 'Lorry',
    capacityTonnes: 8,
    routes: 'Nairobi-Kampala',
    photos: []
  });
  const pendingDocRef = useRef('');
  const profileDocInputRef = useRef(null);
  const vehiclePhotoInputRef = useRef(null);

  useCurrentUserPolling(Boolean(user.email), setUser, 30000);

  const loadFleet = useCallback(async () => {
    if (role !== 'owner') return;
    try {
      const data = await api.fleetTrucks();
      if (Array.isArray(data.trucks)) setFleet(data.trucks.map(normalizeTruck));
    } catch (_err) {
      setFleet(workspaceFleet.slice(0, 2));
    }
  }, [role]);

  useEffect(() => {
    loadFleet();
  }, [loadFleet]);

  usePollingEffect(role === 'owner', loadFleet, 30000);

  const profileDocs = profileDocumentsForRole(role);
  const missingDocs = missingRequiredProfileDocuments(user, role);
  const hasProfileBasics = Boolean(user?.firstName && user?.lastName && user?.phone && user?.country);
  const workspaceQueue =
    role === 'owner'
      ? [
          {
            label: 'Complete owner details',
            detail: hasProfileBasics ? 'Ready' : 'Add name, phone, and country',
            done: hasProfileBasics,
            path: '/app/profile?complete=details'
          },
          {
            label: 'Upload verification docs',
            detail: missingDocs.length ? `${missingDocs.length} still needed` : 'Submitted for review',
            done: !missingDocs.length,
            path: missingDocs[0] ? `/app/profile?document=${encodeURIComponent(missingDocs[0])}` : '/app/onboarding'
          },
          {
            label: 'Register a vehicle',
            detail: fleet.length
              ? `${fleet.length} vehicle record${fleet.length === 1 ? '' : 's'}`
              : 'Add plate, capacity, routes, and photos',
            done: fleet.length > 0,
            path: '/app/vehicles'
          }
        ]
      : [
          {
            label: 'Complete shipper details',
            detail: hasProfileBasics ? 'Ready' : 'Add name, phone, and country',
            done: hasProfileBasics,
            path: '/app/profile?complete=details'
          },
          {
            label: 'Upload shipper documents',
            detail: missingDocs.length ? `${missingDocs.length} still needed` : 'Submitted for review',
            done: !missingDocs.length,
            path: missingDocs[0] ? `/app/profile?document=${encodeURIComponent(missingDocs[0])}` : '/app/onboarding'
          },
          {
            label: 'Create first booking',
            detail: 'Open the booking form when docs are ready',
            done: false,
            path: '/app/book'
          }
        ];

  function openProfileDoc(documentType) {
    pendingDocRef.current = normalizeProfileDocumentType(documentType, role);
    profileDocInputRef.current?.click();
  }

  async function uploadProfileDoc(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pendingDocRef.current) return;

    setUploading(pendingDocRef.current);
    try {
      const data = await api.uploadProfileDocument(pendingDocRef.current, file);
      if (data.user) {
        setSession({ user: data.user });
        setUser(data.user);
      }
      notify('Document sent to admin review');
    } catch (err) {
      notify(err.message);
    } finally {
      setUploading('');
    }
  }

  async function uploadVehiclePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading('vehicle-photo');
    try {
      const data = await api.uploadCargo([file]);
      const url = data.urls?.[0];
      if (!url) throw new Error('Photo upload did not return a URL');
      setTruckDraft((current) => ({ ...current, photos: [...(current.photos || []), url] }));
      notify('Vehicle photo attached to this enrollment');
    } catch (err) {
      notify(err.message);
    } finally {
      setUploading('');
    }
  }

  function updateTruckDraft(key, value) {
    setTruckDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitTruck(event) {
    event.preventDefault();
    if (role !== 'owner') return;

    const payload = {
      ...truckDraft,
      capacityTonnes: Number(truckDraft.capacityTonnes || 0),
      routes: String(truckDraft.routes || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    };

    try {
      const data = await api.createTruck(payload);
      setFleet((current) => [normalizeTruck(data.truck || payload), ...current]);
      notify('Vehicle sent to admin review');
      setTruckDraft((current) => ({ ...current, plateNumber: '', photos: [] }));
    } catch (err) {
      notify(err.message);
    }
  }

  function openBookingWorkspace() {
    const missing = missingRequiredProfileDocuments(user, role);
    if (missing.length) {
      notify(`Please complete your profile: ${missing.map((item) => `${item} is required`).join(', ')}`);
      return;
    }

    navigate('/app/book');
  }

  return (
    <section className="workspace-layout">
      <input
        ref={profileDocInputRef}
        type="file"
        accept={documentUploadAccept}
        onChange={uploadProfileDoc}
        style={{ display: 'none' }}
      />
      <input
        ref={vehiclePhotoInputRef}
        type="file"
        accept={imageUploadAccept}
        onChange={uploadVehiclePhoto}
        style={{ display: 'none' }}
      />
      <div className="stack">
        <section className="intro-band compact-intro">
          <div>
            <p className="eyebrow">{roleName(role)} Setup</p>
            <h2>{role === 'owner' ? 'Get approved to bid on work.' : 'Get approved to ship.'}</h2>
            <p>
              {role === 'owner'
                ? 'Owner documents and vehicles go to admin review before your fleet starts taking loads.'
                : 'Shipper documents go to admin review, then your bookings and carrier bids stay in one workspace.'}
            </p>
          </div>
          <div className="command-summary">
            <StatusBadge tone={user.isVerified ? 'success' : 'warn'}>
              {user.isVerified ? 'Verified' : 'Admin review'}
            </StatusBadge>
            <strong>{user.email || 'No active session'}</strong>
            <span>{role === 'owner' ? `${fleet.length} vehicle records` : 'Shipping profile'}</span>
          </div>
        </section>

        <Panel title="Documents for Admin Review" eyebrow="Verification">
          <div className="process-list">
            {(documentStages[role] || documentStages.client).map((item, index) => (
              <span key={item}>
                <strong>{index + 1}</strong>
                {item}
              </span>
            ))}
          </div>
          <div className="doc-list">
            {profileDocs.map((item) => {
              const slug = normalizeProfileDocumentType(item, role);
              const existingDoc = findProfileDocument(user.documents || [], item, role);
              const docStatus = existingDoc ? existingDoc.status : 'missing';

              return (
                <DocumentSlotButton
                  key={item}
                  label={item}
                  status={docStatus}
                  busy={uploading === slug}
                  labels={{
                    approved: 'Verified',
                    pending: 'Pending Review',
                    rejected: 'Rejected',
                    expired: 'Expired',
                    missing: 'Not Uploaded'
                  }}
                  onClick={() => openProfileDoc(item)}
                  style={{ margin: '4px 0' }}
                />
              );
            })}
          </div>
          <p className="muted-note">
            {documentUploadLimitText}. Rejected or expired documents can be replaced from this list.
          </p>
        </Panel>

        {role === 'owner' ? (
          <Panel title="Vehicle Registration" eyebrow="Owner Review">
            <form className="modal-form" onSubmit={submitTruck}>
              <div className="form-grid">
                <Input
                  label="Plate number"
                  value={truckDraft.plateNumber}
                  onChange={(value) => updateTruckDraft('plateNumber', value)}
                />
                <Select
                  label="Vehicle type"
                  value={truckDraft.type}
                  onChange={(value) => updateTruckDraft('type', value)}
                  options={vehicleTypes}
                />
                <Input
                  label="Capacity tonnes"
                  type="number"
                  value={truckDraft.capacityTonnes}
                  onChange={(value) => updateTruckDraft('capacityTonnes', Number(value))}
                />
                <Input
                  label="Preferred routes"
                  value={truckDraft.routes}
                  onChange={(value) => updateTruckDraft('routes', value)}
                />
              </div>
              <div style={{ display: 'grid', gap: '10px', width: '100%', margin: '10px 0' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--muted)' }}>
                  Vehicle Photos
                </label>
                <div className="photo-preview-grid">
                  {truckDraft.photos.length
                    ? truckDraft.photos.map((photo, i) => (
                        <div key={photo} className="photo-preview-card">
                          <img src={photo} alt={`Vehicle photo ${i + 1}`} loading="lazy" />
                          <button
                            type="button"
                            className="photo-remove-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTruckDraft((current) => ({
                                ...current,
                                photos: current.photos.filter((p) => p !== photo)
                              }));
                            }}
                          >
                            &times;
                          </button>
                        </div>
                      ))
                    : null}
                </div>
                <button
                  type="button"
                  className="premium-upload-zone"
                  disabled={uploading === 'vehicle-photo'}
                  onClick={() => vehiclePhotoInputRef.current?.click()}
                >
                  <Image size={28} />
                  <span>{uploading === 'vehicle-photo' ? 'Uploading photo...' : 'Click to Upload Vehicle Photo'}</span>
                  <small>Supports JPEG, PNG, WEBP (Max 10MB)</small>
                </button>
              </div>
              <button className="primary icon-label" type="submit">
                <Truck size={18} />
                <span>Send Vehicle for Review</span>
              </button>
            </form>
          </Panel>
        ) : (
          <Panel title="Shipping Workspace" eyebrow="Next Step">
            <div className="button-row">
              <button className="primary icon-label" type="button" onClick={openBookingWorkspace}>
                <Plus size={18} />
                <span>Book Shipment</span>
              </button>
              <button className="secondary icon-label" type="button" onClick={() => navigate('/app/bids')}>
                <BarChart3 size={18} />
                <span>Review Bids</span>
              </button>
            </div>
          </Panel>
        )}
      </div>

      <aside className="side-stack">
        <Panel title={role === 'owner' ? 'Next Owner Steps' : 'Next Shipper Steps'} eyebrow="Workspace">
          <div className="doc-list compact">
            {workspaceQueue.map((item) => (
              <button type="button" key={item.label} onClick={() => navigate(item.path)}>
                <span className="queue-step-main">
                  <span>{item.label}</span>
                  <StatusBadge tone={item.done ? 'success' : 'warn'}>{item.done ? 'Done' : 'Next'}</StatusBadge>
                </span>
                <small>{item.detail}</small>
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={role === 'owner' ? 'Wanna Ship?' : 'Own Trucks?'} eyebrow="Optional">
          <div className="verification-card">
            <UserRound size={28} />
            <strong>{role === 'owner' ? 'Create a shipper profile' : 'Create an owner profile'}</strong>
            <span>Run each side separately so permissions, documents, and payments stay clean.</span>
          </div>
          <a className="secondary full icon-label" href="/#signup">
            <UserRound size={18} />
            <span>{role === 'owner' ? 'Start shipping' : 'Register fleet'}</span>
          </a>
        </Panel>
      </aside>
    </section>
  );
}
