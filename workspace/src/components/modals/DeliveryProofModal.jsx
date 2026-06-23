import React, { useRef, useState } from 'react';
import { Image, ShieldCheck, X } from 'lucide-react';
import { api } from '../../api.js';
import Input from '../Input.jsx';
import {
  latestTrackingPoint,
  formatCoordinatePair,
  imageUploadAccept
} from '../../utils/helpers.js';

export default function DeliveryProofModal({ shipment, onClose, onSubmit, busy }) {
  const latest = latestTrackingPoint(shipment);
  const [signerName, setSignerName] = useState(shipment?.receiverName || '');
  const [signerRole, setSignerRole] = useState('Receiving officer');
  const [signatureValue, setSignatureValue] = useState('');
  const [otp, setOtp] = useState('');
  const [photos, setPhotos] = useState([]);
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString());
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [capturingGps, setCapturingGps] = useState(false);
  const [error, setError] = useState('');
  const [location, setLocation] = useState(() =>
    latest
      ? {
          lat: Number(latest.lat),
          lng: Number(latest.lng),
          accuracy: Number.isFinite(Number(latest.accuracy)) ? Number(latest.accuracy) : undefined,
          recordedAt: latest.timestamp || new Date().toISOString()
        }
      : null
  );
  const fileRef = useRef(null);

  async function requestOtp() {
    setRequestingOtp(true);
    setError('');
    try {
      const data = await api.requestDeliveryOtp(shipment.bookingId);
      setChallenge(data.challenge);
    } catch (err) {
      setError(err.message);
    } finally {
      setRequestingOtp(false);
    }
  }

  function captureGps() {
    if (!navigator.geolocation) {
      setError('This browser cannot capture GPS.');
      return;
    }
    setCapturingGps(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          recordedAt: new Date(position.timestamp || Date.now()).toISOString()
        });
        setCapturingGps(false);
      },
      (gpsError) => {
        setError(gpsError.message || 'Unable to capture arrival GPS.');
        setCapturingGps(false);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 }
    );
  }

  function handleFiles(event) {
    const selected = Array.from(event.target.files || []).slice(0, 5);
    setPhotos(selected);
    setCapturedAt(new Date().toISOString());
    event.target.value = '';
  }

  function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!challenge) return setError('Send the receiver OTP first.');
    if (!location) return setError('Capture arrival GPS before finalizing proof.');
    if (!photos.length) return setError('Add at least one arrival or handover photo.');
    if (!/^\d{6}$/.test(otp)) return setError('Enter the 6-digit receiver OTP.');
    if (!signerName.trim() || !signatureValue.trim()) return setError('Receiver name and signature are required.');
    if (!consent) return setError('The receiver must accept the delivery confirmation statement.');

    onSubmit({
      signerName: signerName.trim(),
      signerRole: signerRole.trim(),
      signatureValue: signatureValue.trim(),
      otp,
      photos,
      capturedAt,
      signedAt: new Date().toISOString(),
      consent,
      location
    });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card delivery-proof-modal" role="dialog" aria-modal="true" aria-labelledby="pod-title">
        <div className="modal-card-head">
          <div>
            <p className="eyebrow">Receiver-grade closeout</p>
            <h3 id="pod-title">Seal Delivery Proof</h3>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={busy}>
            <X size={18} />
          </button>
        </div>
        <form className="modal-card-body" onSubmit={handleSubmit}>
          <div className="proof-assurance">
            <ShieldCheck size={22} />
            <span>OTP, signature, GPS, timestamps, and photo hashes are sealed into an append-only custody chain.</span>
          </div>

          <div className="proof-step">
            <div className="proof-step-heading">
              <div>
                <strong>1. Receiver OTP</strong>
                <span>Sent to the receiver phone saved on this booking.</span>
              </div>
              <button className="secondary" type="button" onClick={requestOtp} disabled={requestingOtp || busy}>
                {requestingOtp ? 'Sending...' : challenge ? 'Resend OTP' : 'Send OTP'}
              </button>
            </div>
            {challenge ? (
              <small className="proof-success">
                Code sent to phone ending {challenge.receiverPhoneLast4}. Expires{' '}
                {new Date(challenge.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
              </small>
            ) : null}
            <Input
              label="Receiver OTP"
              value={otp}
              onChange={(value) => setOtp(value.replace(/\D/g, '').slice(0, 6))}
            />
          </div>

          <div className="proof-step">
            <div className="proof-step-heading">
              <div>
                <strong>2. Arrival GPS</strong>
                <span>Use the device at the handover point.</span>
              </div>
              <button className="secondary" type="button" onClick={captureGps} disabled={capturingGps || busy}>
                {capturingGps ? 'Capturing...' : 'Capture GPS'}
              </button>
            </div>
            <div className="facts-grid">
              <span>Coordinates</span>
              <strong>{location ? formatCoordinatePair(location) : 'Not captured'}</strong>
              <span>Accuracy</span>
              <strong>
                {Number.isFinite(Number(location?.accuracy)) ? `${Math.round(location.accuracy)} m` : 'Pending'}
              </strong>
            </div>
          </div>

          <div className="proof-step">
            <strong>3. Handover photos</strong>
            <span className="muted-note">
              Add 1–5 current photos. The server computes a SHA-256 hash for each file.
            </span>
            <input
              ref={fileRef}
              type="file"
              accept={imageUploadAccept}
              capture="environment"
              multiple
              style={{ display: 'none' }}
              onChange={handleFiles}
            />
            <button className="ghost icon-label" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Image size={18} />
              <span>{photos.length ? 'Replace photos' : 'Add photos'}</span>
            </button>
            {photos.length ? (
              <div className="proof-file-list">
                {photos.map((file) => (
                  <span key={`${file.name}-${file.lastModified}`}>{file.name}</span>
                ))}
              </div>
            ) : null}
          </div>

          <div className="proof-step">
            <strong>4. Electronic signature</strong>
            <Input label="Receiver name" value={signerName} onChange={setSignerName} />
            <Input label="Receiver role" value={signerRole} onChange={setSignerRole} />
            <Input label="Type full name as signature" value={signatureValue} onChange={setSignatureValue} />
            <label className="proof-consent">
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span>I confirm that I received this shipment and that this electronic signature is accurate.</span>
            </label>
          </div>

          {error ? <div className="form-error">{error}</div> : null}
          <div className="button-row">
            <button className="primary icon-label" type="submit" disabled={busy}>
              <ShieldCheck size={18} />
              <span>{busy ? 'Sealing proof...' : 'Verify and Seal Proof'}</span>
            </button>
            <button className="ghost" type="button" onClick={onClose} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
