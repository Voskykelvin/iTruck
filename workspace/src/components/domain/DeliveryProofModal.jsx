import { useState, useRef } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { Camera, CheckCircle } from 'lucide-react';
import { useUploadDeliveryProofPhotos, useFinalizeDeliveryProof } from '../../queries/operations';
import { api } from '../../api';
import { useToast } from '../ui/Toast';

export default function DeliveryProofModal({ isOpen, onClose, shipmentId }) {
  const [step, setStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [photos, setPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isRequestingOtp, setIsRequestingOtp] = useState(false);
  const fileInputRef = useRef(null);
  const { addToast } = useToast();

  const uploadPhotosMutation = useUploadDeliveryProofPhotos();
  const finalize = useFinalizeDeliveryProof();

  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPhotos(files);
  };

  const requestLocationAndUpload = () => {
    if (!photos.length) {
      addToast({ title: 'Missing Photo', message: 'Please select a photo first.', type: 'warning' });
      return;
    }

    setIsUploading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        uploadPhotosMutation.mutate(
          {
            bookingId: shipmentId,
            files: photos,
            metadata: {
              capturedAt: new Date().toISOString(),
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy
            }
          },
          {
            onSuccess: () => {
              handleNextStep();
            },
            onError: (err) => {
              addToast({ title: 'Upload Failed', message: err.message, type: 'error' });
              setIsUploading(false);
            }
          }
        );
      },
      () => {
        setIsUploading(false);
        addToast({
          title: 'Location Required',
          message: 'Please allow location access to prove delivery location.',
          type: 'error'
        });
      },
      { enableHighAccuracy: true }
    );
  };

  const handleNextStep = async () => {
    setIsUploading(false);
    setStep(2);
    try {
      setIsRequestingOtp(true);
      await api.requestDeliveryOtp(shipmentId);
      addToast({ title: 'OTP Sent', message: 'The receiver has been sent an OTP.', type: 'info' });
    } catch (err) {
      addToast({ title: 'Failed to send OTP', message: err.message, type: 'error' });
    } finally {
      setIsRequestingOtp(false);
    }
  };

  const handleSubmit = () => {
    if (!otp) {
      addToast({ title: 'Missing OTP', message: 'Please enter the OTP.', type: 'warning' });
      return;
    }
    finalize.mutate(
      {
        bookingId: shipmentId,
        data: { otp, verificationMethod: 'sms_otp', signatureType: 'typed', signatureData: 'Receiver OTP' }
      },
      {
        onSuccess: () => {
          setStep(3);
        },
        onError: (err) => {
          addToast({ title: 'Verification Failed', message: err.message, type: 'error' });
        }
      }
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={step === 3 ? 'Delivery Confirmed' : 'Confirm Delivery'}
      footer={
        step === 1 ? (
          <Button
            variant="primary"
            loading={isUploading || uploadPhotosMutation.isPending}
            onClick={requestLocationAndUpload}
          >
            Continue to Verification
          </Button>
        ) : step === 2 ? (
          <Button variant="primary" loading={isRequestingOtp || finalize.isPending} onClick={handleSubmit}>
            Submit OTP & Confirm
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={() => {
              onClose();
              window.location.reload();
            }}
          >
            Done
          </Button>
        )
      }
    >
      {step === 1 && (
        <div className="stack">
          <p className="text-secondary">
            Please upload photos of the unloaded cargo in good condition before requesting the receiver&apos;s OTP.
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
              {photos.length ? `${photos.length} Photo(s) selected` : 'Tap to upload cargo photos'}
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
              Required: Cargo condition at arrival
            </div>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </div>
      )}

      {step === 2 && (
        <div className="stack">
          <p className="text-secondary">
            An OTP has been sent to the receiver. Enter it below to cryptographically sign the proof of delivery.
          </p>

          <Input
            label="Receiver OTP"
            placeholder="e.g. 123456"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength={6}
            style={{ fontSize: 'var(--text-xl)', letterSpacing: '0.2em', textAlign: 'center' }}
          />
        </div>
      )}

      {step === 3 && (
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <CheckCircle size={64} color="var(--success)" style={{ marginBottom: 'var(--space-4)' }} />
          <h3 style={{ fontSize: 'var(--text-xl)', color: 'var(--ink)' }}>Delivery Verified</h3>
          <p className="text-secondary">The shipment is marked as delivered and payment is ready for release.</p>
        </div>
      )}
    </Modal>
  );
}
