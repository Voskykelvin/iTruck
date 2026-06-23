import React, { useState } from 'react';
import { CreditCard, Phone, Smartphone, Wallet, X } from 'lucide-react';
import Input from '../Input.jsx';
import { money, isDebitTransaction, statusLabel } from '../../utils/helpers.js';

export default function WalletTopupModal({ balance, onClose, onTopup, busy, transactions = [] }) {
  const [method, setMethod] = useState('mpesa');
  const [amount, setAmount] = useState(50);
  const [phone, setPhone] = useState('');
  const presets = [10, 25, 50, 100, 250, 500];

  const methods = [
    { key: 'mpesa', label: 'M-Pesa', icon: Smartphone },
    { key: 'card', label: 'Card', icon: CreditCard },
    { key: 'bank', label: 'Bank', icon: Wallet },
    { key: 'mtn', label: 'MTN MoMo', icon: Phone }
  ];

  function handleSubmit(e) {
    e.preventDefault();
    onTopup({ method, amount: Number(amount), phone });
  }

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-modal="true" aria-labelledby="wallet-adjustment-title">
        <div className="modal-card-head">
          <h3 id="wallet-adjustment-title">Admin Wallet Adjustment</h3>
          <button type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <form className="modal-card-body" onSubmit={handleSubmit}>
          <div className="wallet-card" style={{ marginBottom: 4 }}>
            <span>Current balance</span>
            <strong>{money(balance)}</strong>
            <small>Funds are held in escrow until delivery confirmation.</small>
          </div>
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Payment method
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
          <div>
            <p className="eyebrow" style={{ marginBottom: 8 }}>
              Amount (USD)
            </p>
            <div className="topup-amount-chips">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`topup-chip ${amount === p ? 'active' : ''}`}
                  onClick={() => setAmount(p)}
                >
                  ${p}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <Input label="Custom amount" type="number" value={amount} onChange={(v) => setAmount(Number(v))} />
            </div>
          </div>
          {(method === 'mpesa' || method === 'mtn') && (
            <Input label="Phone number (with country code)" value={phone} onChange={setPhone} />
          )}
          {transactions.length > 0 && (
            <div>
              <p className="eyebrow" style={{ marginBottom: 8 }}>
                Recent transactions
              </p>
              <div className="tx-history">
                {transactions.slice(0, 6).map((tx, i) => {
                  const debit = isDebitTransaction(tx);
                  return (
                    <div className="tx-row" key={tx._id || tx.id || tx.reference || i}>
                      <div>
                        <strong>{tx.description || tx.method || 'Transaction'}</strong>
                        <span>
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : statusLabel(tx.status)}
                        </span>
                      </div>
                      <span className={`tx-amount ${debit ? 'debit' : ''}`}>
                        {debit ? '-' : '+'}
                        {money(tx.amount || 0)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="button-row">
            <button className="primary icon-label" type="submit" disabled={busy || !amount}>
              <Wallet size={18} />
              <span>{busy ? 'Processing...' : `Top up ${money(amount)}`}</span>
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
