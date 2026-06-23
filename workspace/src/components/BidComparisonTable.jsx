import { useState } from 'react';
import { Star } from 'lucide-react';
import StatusBadge from './StatusBadge.jsx';
import { money, statusLabel } from '../utils/helpers.js';

export default function BidComparisonTable({ bids = [], onAward, busyId }) {
  const [sortBy, setSortBy] = useState('price');

  const sorted = [...bids].sort((a, b) => {
    if (sortBy === 'price') return a.amount - b.amount;
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    if (sortBy === 'time') return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    return 0;
  });

  const bestId = sorted[0]?.id;

  return (
    <div>
      <div className="bid-sort-btns">
        {[
          ['price', 'By Price'],
          ['rating', 'By Rating'],
          ['time', 'Response Time']
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            className={`bid-sort-btn ${sortBy === k ? 'active' : ''}`}
            onClick={() => setSortBy(k)}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="bid-comparison">
        <table>
          <thead>
            <tr>
              <th>Carrier</th>
              <th>Truck</th>
              <th>Price</th>
              <th>Rating</th>
              <th>Note</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((bid) => (
              <tr key={bid.id} className={bid.id === bestId && sortBy === 'price' ? 'best-bid' : ''}>
                <td>{bid.ownerName}</td>
                <td>{bid.truckName}</td>
                <td>
                  <span className="bid-amount-cell">{money(bid.amount)}</span>
                </td>
                <td>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Star size={12} style={{ color: 'var(--amber)' }} />
                    {bid.rating ? bid.rating.toFixed(1) : 'New'}
                  </span>
                </td>
                <td style={{ maxWidth: 180, fontSize: 12, color: 'var(--muted)' }}>{bid.message}</td>
                <td>
                  <StatusBadge tone={bid.status === 'accepted' ? 'success' : 'default'}>
                    {statusLabel(bid.status)}
                  </StatusBadge>
                </td>
                <td>
                  {bid.status !== 'accepted' && (
                    <button
                      className="primary"
                      type="button"
                      style={{ minHeight: 34, padding: '0 12px', fontSize: 12 }}
                      disabled={busyId === bid.id}
                      onClick={() => onAward(bid)}
                    >
                      {busyId === bid.id ? '...' : 'Award'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {bids.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>
                  No carrier bids yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
