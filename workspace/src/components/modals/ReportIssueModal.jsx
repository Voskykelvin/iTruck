import React, { useRef, useState } from 'react';
import { Image, X } from 'lucide-react';

export default function ReportIssueModal({ shipment, onClose, onSubmit, busy }) {
  const [kind, setKind] = useState('support');
  const [issueType, setIssueType] = useState('delay');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('normal');
  const [photos, setPhotos] = useState([]);
  const fileRef = useRef(null);

  const issueTypes = [
    ['delay', 'Delay'],
    ['tracking', 'Tracking'],
    ['delivery', 'Delivery'],
    ['damage', 'Damage'],
    ['loss', 'Loss'],
    ['payment', 'Payment'],
    ['documents', 'Documents'],
    ['conduct', 'Conduct'],
    ['technical', 'Technical'],
    ['other', 'Other']
  ];

  function handleFileChange(e) {
    setPhotos((current) => [...current, ...Array.from(e.target.files || [])].slice(0, 5));
    e.target.value = '';
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!description.trim()) return;
    onSubmit({ kind, issueType, description, severity, photos });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="report-issue-title">
        <div className="modal-card-head">
          <h3 id="report-issue-title">Report Issue</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form className="modal-card-body" onSubmit={handleSubmit}>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Case type
            </p>
            <div className="severity-grid">
              {[
                ['support', 'Support'],
                ['dispute', 'Formal dispute']
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`severity-btn ${kind === value ? 'active' : ''}`}
                  onClick={() => setKind(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {kind === 'dispute' ? (
              <p className="muted-note">A formal dispute pauses the shipment status until operations resolves it.</p>
            ) : null}
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Issue type
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {issueTypes.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`severity-btn ${issueType === value ? 'active' : ''}`}
                  style={{ minWidth: 90 }}
                  onClick={() => setIssueType(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Severity
            </p>
            <div className="severity-grid">
              {[
                ['low', 'Low'],
                ['normal', 'Normal'],
                ['high', 'High']
              ].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`severity-btn ${val} ${severity === val ? 'active' : ''}`}
                  onClick={() => setSeverity(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={`Describe the ${issueType} issue in detail...`}
              rows={4}
              required
            />
          </label>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Photos (optional)
            </p>
            <div className="photo-upload-strip">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
              <button type="button" className="ghost icon-label" onClick={() => fileRef.current?.click()}>
                <Image size={16} />
                <span>Add photos</span>
              </button>
              {photos.length > 0 && (
                <span className="attached-count">
                  {photos.length} photo{photos.length === 1 ? '' : 's'} attached
                </span>
              )}
            </div>
          </div>
          {shipment && (
            <div className="facts-grid" style={{ marginBottom: 0 }}>
              <span>Shipment</span>
              <strong>{shipment.id}</strong>
              <span>Route</span>
              <strong>{shipment.route}</strong>
            </div>
          )}
          <div className="button-row">
            <button className="primary" type="submit" disabled={busy || !description.trim()}>
              {busy ? 'Submitting...' : 'Submit Report'}
            </button>
            <button className="ghost" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
