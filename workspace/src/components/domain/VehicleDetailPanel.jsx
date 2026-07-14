import { useState, useRef } from 'react';
import { X, UploadCloud, FileText, CheckCircle, ShieldAlert, UserPlus, Image as ImageIcon } from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { useDrivers, useAssignDriverTruck, useUnassignDriverTruck } from '../../queries/commercial';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../api';
import { useToast } from '../ui/Toast';

export default function VehicleDetailPanel({ isOpen, onClose, truck }) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const { data: driversData } = useDrivers();
  const assignDriver = useAssignDriverTruck();
  const unassignDriver = useUnassignDriverTruck();

  const drivers = driversData?.drivers || [];

  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const photoInputRef = useRef(null);
  const documentInputRef = useRef(null);
  const [activeDocType, setActiveDocType] = useState(null);
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);

  if (!isOpen || !truck) return null;

  const REQUIRED_DOCS = [
    { type: 'insurance', label: 'Vehicle Insurance' },
    { type: 'vehicle-logbook', label: 'Logbook' },
    { type: 'road-license', label: 'Road License' }
  ];

  const handleAssignDriver = (e) => {
    const driverId = e.target.value;
    if (driverId) {
      assignDriver.mutate(
        { driverId, truckId: truck.id },
        {
          onSuccess: () => addToast({ title: 'Driver assigned', type: 'success' }),
          onError: (err) => addToast({ title: 'Failed to assign driver', message: err.message, type: 'error' })
        }
      );
    } else if (truck.assignedDriver) {
      unassignDriver.mutate(truck.assignedDriver, {
        onSuccess: () => addToast({ title: 'Driver unassigned', type: 'info' })
      });
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      await api.uploadTruckPhoto(truck.id, file);
      queryClient.invalidateQueries({ queryKey: ['commercial', 'fleet'] });
      addToast({ title: 'Photo Uploaded', type: 'success' });
    } catch (err) {
      addToast({ title: 'Upload Failed', message: err.message, type: 'error' });
    } finally {
      setIsUploadingPhoto(false);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  };

  const triggerDocUpload = (docType) => {
    setActiveDocType(docType);
    if (documentInputRef.current) documentInputRef.current.click();
  };

  const handleDocUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocType) return;

    setIsUploadingDoc(true);
    try {
      await api.uploadTruckDocument(truck.id, activeDocType, file);
      queryClient.invalidateQueries({ queryKey: ['commercial', 'fleet'] });
      addToast({ title: 'Document Uploaded', type: 'success' });
    } catch (err) {
      addToast({ title: 'Upload Failed', message: err.message, type: 'error' });
    } finally {
      setIsUploadingDoc(false);
      setActiveDocType(null);
      if (documentInputRef.current) documentInputRef.current.value = '';
    }
  };

  return (
    <>
      <div
        className="animate-fade-in"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          zIndex: 100,
          backdropFilter: 'blur(2px)'
        }}
        onClick={onClose}
      />
      <div
        className="animate-slide-up"
        style={{
          position: 'fixed',
          right: 0,
          top: 0,
          bottom: 0,
          width: '100%',
          maxWidth: 500,
          backgroundColor: 'var(--surface-1)',
          zIndex: 101,
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid var(--border)'
        }}
      >
        <div
          className="row-between"
          style={{ padding: 'var(--space-4) var(--space-6)', borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', fontWeight: 600 }}>{truck.name}</h2>
            <div className="text-secondary mono" style={{ fontSize: 'var(--text-sm)' }}>
              {truck.plateNumber || truck.id.substring(0, 8)}
            </div>
          </div>
          <button className="btn btn-ghost" style={{ padding: 8 }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }} className="stack-lg">
          {/* Driver Assignment */}
          <section className="stack">
            <h3 className="eyebrow" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <UserPlus size={16} /> Driver Assignment
            </h3>
            <div className="input-group">
              <select className="input-field" value={truck.assignedDriver || ''} onChange={handleAssignDriver}>
                <option value="">Unassigned</option>
                {drivers.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.firstName} {d.lastName}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* Photos */}
          <section className="stack">
            <div className="row-between">
              <h3
                className="eyebrow"
                style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
              >
                <ImageIcon size={16} /> Vehicle Photos
              </h3>
            </div>

            <div className="grid-2">
              {truck.photos?.map((photo, i) => (
                <div
                  key={i}
                  style={{
                    aspectRatio: '1',
                    borderRadius: 'var(--radius)',
                    overflow: 'hidden',
                    border: '1px solid var(--border)'
                  }}
                >
                  <img src={photo} alt="Vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ))}

              <button
                className="hover-lift"
                onClick={() => photoInputRef.current?.click()}
                disabled={isUploadingPhoto}
                style={{
                  aspectRatio: '1',
                  borderRadius: 'var(--radius)',
                  border: '2px dashed var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'var(--surface-2)',
                  cursor: 'pointer',
                  color: 'var(--text-secondary)',
                  opacity: isUploadingPhoto ? 0.7 : 1
                }}
              >
                <UploadCloud size={24} style={{ marginBottom: 'var(--space-2)' }} />
                <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                  {isUploadingPhoto ? 'Uploading...' : 'Upload Photo'}
                </span>
              </button>
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp"
                ref={photoInputRef}
                onChange={handlePhotoUpload}
                hidden
              />
            </div>
          </section>

          {/* Documents */}
          <section className="stack">
            <h3 className="eyebrow" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <FileText size={16} /> Compliance Documents
            </h3>

            <div className="stack-sm">
              {REQUIRED_DOCS.map((docDef) => {
                const existingDoc = truck.documents?.find((d) => d.type === docDef.type);

                return (
                  <div
                    key={docDef.type}
                    className="row-between"
                    style={{
                      padding: 'var(--space-3)',
                      background: 'var(--surface-2)',
                      borderRadius: 'var(--radius)',
                      border: '1px solid var(--border)'
                    }}
                  >
                    <div className="row">
                      {existingDoc ? (
                        <CheckCircle size={18} color="var(--success)" />
                      ) : (
                        <ShieldAlert size={18} color="var(--warning)" />
                      )}
                      <span style={{ marginLeft: 'var(--space-2)', fontWeight: 500 }}>{docDef.label}</span>
                    </div>
                    {existingDoc ? (
                      <Badge variant="success">Verified</Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => triggerDocUpload(docDef.type)}
                        loading={isUploadingDoc && activeDocType === docDef.type}
                      >
                        Upload
                      </Button>
                    )}
                  </div>
                );
              })}
              <input
                type="file"
                accept="image/jpeg, image/png, image/webp, application/pdf"
                ref={documentInputRef}
                onChange={handleDocUpload}
                hidden
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
