import { useRef, useState } from 'react';
import { Camera, CheckCircle } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import {
  useDeliveryProofPolicy,
  useFinalizeDeliveryProof,
  useUploadDeliveryProofPhotos
} from '../../queries/operations';
import { api } from '../../api';
import { useToast } from '../ui/Toast';

function currentLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
      reject,
      { enableHighAccuracy: true }
    );
  });
}

export default function DeliveryProofModal({ isOpen, onClose, shipmentId }) {
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [signerName, setSignerName] = useState('');
  const [consent, setConsent] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [assetIds, setAssetIds] = useState([]);
  const [location, setLocation] = useState(null);
  const fileInputRef = useRef(null);
  const { addToast } = useToast();

  const policy = useDeliveryProofPolicy({ enabled: isOpen });
  const uploadPhotos = useUploadDeliveryProofPhotos();
  const finalize = useFinalizeDeliveryProof();
  const strict = policy.data?.mode === 'strict';
  const busy = uploadPhotos.isPending || finalize.isPending;

  const handleUpload = async () => {
    if (!photos.length) {
      addToast({ title: 'Missing Photo', message: 'Please select at least one delivery photo.', type: 'warning' });
      return;
    }
    if (policy.isError) {
      addToast({ title: 'Unable to Confirm', message: 'Delivery policy could not be loaded.', type: 'error' });
      return;
    }

    try {
      const capturedAt = new Date().toISOString();
      const gps = strict ? await currentLocation() : null;
      const uploaded = await uploadPhotos.mutateAsync({
        bookingId: shipmentId,
        files: photos,
        metadata: strict ? { capturedAt, ...gps } : { capturedAt }
      });
      const ids = (uploaded.assets || []).map((asset) => asset.id);
      if (!ids.length) throw new Error('Photo upload did not return a proof record');
      setAssetIds(ids);

      if (!strict) {
        await finalize.mutateAsync({ bookingId: shipmentId, data: { assetIds: ids } });
        setStep(3);
        return;
      }

      const recordedAt = new Date().toISOString();
      setLocation({ ...gps, recordedAt });
      await api.requestDeliveryOtp(shipmentId);
      addToast({ title: 'OTP Sent', message: 'The receiver has been sent an OTP.', type: 'info' });
      setStep(2);
    } catch (err) {
      const locationDenied = strict && err?.code === 1;
      addToast({
        title: locationDenied ? 'Location Required' : 'Delivery Confirmation Failed',
        message: locationDenied ? 'Please allow location access to use strict delivery verification.' : err.message,
        type: 'error'
      });
    }
  };

  const handleStrictSubmit = async () => {
    if (!/^\d{6}$/.test(otp) || !signerName.trim() || !consent) {
      addToast({
        title: 'Verification Incomplete',
        message: 'Enter the 6-digit OTP, receiver name, and signature consent.',
        type: 'warning'
      });
      return;
    }
    const now = new Date().toISOString();
    try {
      await finalize.mutateAsync({
        bookingId: shipmentId,
        data: {
          otp,
          assetIds,
          signerName: signerName.trim(),
          signerRole: 'Receiver',
          signatureType: 'typed',
          signatureValue: signerName.trim(),
          consent: true,
          signedAt: now,
          clientTimestamp: now,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          location
        }
      });
      setStep(3);
    } catch (err) {
      addToast({ title: 'Verification Failed', message: err.message, type: 'error' });
    }
  };

  const finish = () => {
    onClose();
    window.location.reload();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 3 ? 'Delivery Confirmed' : 'Confirm Delivery'}
      footer={
        step === 1 ? (
          <Button variant="primary" loading={busy || policy.isLoading} onClick={handleUpload}>
            {strict ? 'Continue to Verification' : 'Confirm Delivery'}
          </Button>
        ) : step === 2 ? (
          <Button variant="primary" loading={finalize.isPending} onClick={handleStrictSubmit}>
            Submit OTP & Confirm
          </Button>
        ) : (
          <Button variant="primary" onClick={finish}>
            Done
          </Button>
        )
      }
    >
      {step === 1 && (
        <div className="stack">
          <p className="text-secondary">
            {strict
              ? 'Upload photos of the unloaded cargo. GPS, receiver OTP, and signature are required in strict mode.'
              : 'Upload at least one photo of the delivered cargo. OTP, signature, and GPS are temporarily disabled.'}
          </p>
          <div
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-strong)',
              borderRadius: 'var(--radius)',
              padding: 'var(--space-8)',
              textAlign: 'center',
              cursor: 'pointer',
              background: photos.length ? 'var(--brand-light)' : 'var(--surface-2)'
            }}
          >
            {photos.length ? (
              <CheckCircle size={32} color="var(--brand)" style={{ margin: '0 auto var(--space-2)' }} />
            ) : (
              <Camera size={32} color="var(--text-muted)" style={{ margin: '0 auto var(--space-2)' }} />
            )}
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
              {photos.length ? `${photos.length} photo(s) selected` : 'Tap to upload cargo photos'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>Cargo condition at arrival</div>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            ref={fileInputRef}
            onChange={(event) => setPhotos(Array.from(event.target.files || []))}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <p className="text-secondary">Enter the receiver OTP and typed signature to complete strict verification.</p>
          <Input label="Receiver name" value={signerName} onChange={(event) => setSignerName(event.target.value)} />
          <Input
            label="Receiver OTP"
            placeholder="e.g. 123456"
            value={otp}
            onChange={(event) => setOtp(event.target.value)}
            maxLength={6}
            style={{ fontSize: 'var(--text-xl)', letterSpacing: '0.2em', textAlign: 'center' }}
          />
          <label className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-2)' }}>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span className="text-secondary">The receiver confirms receipt and accepts this typed signature.</span>
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <CheckCircle size={64} color="var(--success)" style={{ marginBottom: 'var(--space-4)' }} />
          <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>Delivery Completed</h3>
          <p className="text-secondary">The shipment is marked as delivered and its proof photo is recorded.</p>
        </div>
      )}
    </Modal>
  );
}
