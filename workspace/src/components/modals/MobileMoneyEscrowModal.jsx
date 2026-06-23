import { useState } from 'react';
import { Smartphone, Phone, X } from 'lucide-react';
import Input from '../Input.jsx';
import { money } from '../../utils/helpers.js';

export default function MobileMoneyEscrowModal({ shipment, busy, onClose, onSubmit }) {
  const preferredMethod = String(shipment?.payment || '')
    .toLowerCase()
    .includes('mtn')
    ? 'mtn'
    : 'mpesa';
  const [method, setMethod] = useState(preferredMethod);
  const [phone, setPhone] = useState('');
  const methods = [
    { key: 'mpesa', label: 'M-Pesa', icon: Smartphone },
    { key: 'mtn', label: 'MTN MoMo', icon: Phone }
  ];

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit({ method, phone });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="mobile-escrow-title">
        <div className="modal-card-head">
          <h3 id="mobile-escrow-title">Mobile Money Escrow</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form className="modal-card-body" onSubmit={handleSubmit}>
          <div className="wallet-card" style={{ marginBottom: 4 }}>
            <span>{shipment?.id || 'Shipment'}</span>
            <strong>{money(shipment?.amount || 0)}</strong>
            <small>{shipment?.route || 'Booking escrow'}</small>
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Provider
            </p>
            <div className="topup-methods">
              {methods.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  className={`topup-method-btn ${method === key ? 'active' : ''}`}
                  onClick={() => setMethod(key)}
                >
                  <Icon size={22} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Input label={method === 'mpesa' ? 'M-Pesa phone' : 'MTN MoMo phone'} value={phone} onChange={setPhone} />
          <div className="button-row">
            <button className="primary icon-label" type="submit" disabled={busy || !phone.trim()}>
              <Smartphone size={18} />
              <span>{busy ? 'Sending...' : 'Send Authorization'}</span>
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
