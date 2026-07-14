import Card from '../ui/Card';
import Avatar from '../ui/Avatar';
import Badge from '../ui/Badge';
import { money, normalizeBid } from '../../utils/helpers';

export default function BidCard({ bid, onAccept, onCounter, onReject, isOwner = false }) {
  const normalized = normalizeBid(bid);

  return (
    <Card className="animate-fade-in stack-sm">
      <div className="row-between">
        <div className="row">
          <Avatar name={normalized.ownerName} size="sm" />
          <div>
            <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{normalized.ownerName}</div>
            <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
              {normalized.truckName}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--brand)' }}>
            {money(normalized.amount)}
          </div>
          <Badge
            variant={
              normalized.status === 'pending' ? 'warning' : normalized.status === 'accepted' ? 'success' : 'default'
            }
            style={{ marginTop: 2 }}
          >
            {normalized.status}
          </Badge>
        </div>
      </div>

      <div
        className="text-secondary"
        style={{
          fontSize: 'var(--text-sm)',
          background: 'var(--surface-2)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-sm)',
          marginTop: 'var(--space-2)'
        }}
      >
        &ldquo;{normalized.message}&rdquo;
      </div>

      {!isOwner && normalized.status === 'pending' && (
        <div className="row" style={{ marginTop: 'var(--space-3)', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => onReject && onReject(normalized.id)}>
            Decline
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => onCounter && onCounter(normalized.id)}>
            Counter
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onAccept && onAccept(normalized.id)}>
            Accept Bid
          </button>
        </div>
      )}
    </Card>
  );
}
