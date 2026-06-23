import React from 'react';
import Panel from './Panel.jsx';
import Input from './Input.jsx';
import TextArea from './TextArea.jsx';
import { money } from '../utils/helpers.js';

export default function OwnerBidReviewPanel({ load, draft, fleet = [], busy, onChange, onSubmit, onClose }) {
  if (!load) return null;

  const selectedTruck = fleet.find((truck) => String(truck.id) === String(draft.truck));
  const amount = Number(draft.amount || 0);

  return (
    <Panel title="Bid Review" eyebrow="Owner Offer" action="Close" onAction={onClose}>
      <div className="facts-grid">
        <span>Cargo</span>
        <strong>{load.cargo}</strong>
        <span>Route</span>
        <strong>{load.route}</strong>
        <span>Pickup</span>
        <strong>{load.window}</strong>
        <span>Shipper target</span>
        <strong>{load.price ? money(load.price) : 'Open rate'}</strong>
      </div>
      <form className="modal-form" onSubmit={onSubmit}>
        <Input
          label="Your bid amount USD"
          type="number"
          value={draft.amount}
          onChange={(value) => onChange('amount', value)}
        />
        <label className="field">
          <span>Vehicle for this bid</span>
          <select value={draft.truck || ''} onChange={(event) => onChange('truck', event.target.value)}>
            <option value="">Best available vehicle</option>
            {fleet.map((truck) => (
              <option value={truck.id} key={truck.id}>
                {truck.plate} - {truck.name}
              </option>
            ))}
          </select>
        </label>
        <TextArea label="Bid note to shipper" value={draft.message} onChange={(value) => onChange('message', value)} />
        <div className="bid-review-note">
          <strong>{amount > 0 ? money(amount) : 'Enter your offer'}</strong>
          <span>
            {selectedTruck
              ? `${selectedTruck.plate} will be shown with your note.`
              : 'The shipper will compare your amount, note, and vehicle readiness before awarding.'}
          </span>
        </div>
        <div className="button-row">
          <button className="primary" type="submit" disabled={busy || amount <= 0}>
            {busy ? 'Submitting...' : 'Place Bid'}
          </button>
          <button className="ghost" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Panel>
  );
}
