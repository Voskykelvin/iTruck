import { useNavigate } from 'react-router-dom';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { MapPin, Truck, Calendar } from 'lucide-react';
import { normalizeBookingShipment } from '../../utils/helpers';

export default function ShipmentCard({ shipment }) {
  const navigate = useNavigate();
  const normalized = normalizeBookingShipment(shipment);

  return (
    <Card onClick={() => navigate(`/app/shipments/${normalized.id}`)} className="animate-fade-in stack-sm">
      <div className="row-between">
        <Badge
          variant={
            normalized.rawStatus === 'delivered'
              ? 'success'
              : normalized.rawStatus === 'in_transit'
                ? 'info'
                : 'default'
          }
        >
          {normalized.status}
        </Badge>
        <span className="text-muted mono" style={{ fontSize: 'var(--text-xs)' }}>
          {normalized.id}
        </span>
      </div>

      <div className="stack-sm" style={{ marginTop: 'var(--space-2)' }}>
        <div className="row" style={{ color: 'var(--ink)', fontWeight: 600 }}>
          <MapPin size={16} color="var(--brand)" />
          <span className="truncate">
            {normalized.origin} → {normalized.destination}
          </span>
        </div>

        <div className="row text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          <Truck size={14} />
          <span>
            {normalized.cargo} • {normalized.vehicle}
          </span>
        </div>

        <div className="row text-muted" style={{ fontSize: 'var(--text-sm)' }}>
          <Calendar size={14} />
          <span>{normalized.eta}</span>
        </div>
      </div>

      <div style={{ marginTop: 'var(--space-3)' }}>
        <div className="row-between" style={{ fontSize: 'var(--text-xs)', marginBottom: 'var(--space-1)' }}>
          <span className="text-secondary">Progress</span>
          <span className="text-ink font-semibold">{normalized.progress}%</span>
        </div>
        <div style={{ width: '100%', height: 4, background: 'var(--surface-2)', borderRadius: 2, overflow: 'hidden' }}>
          <div
            style={{
              width: `${normalized.progress}%`,
              height: '100%',
              background: 'var(--brand)',
              transition: 'width 1s var(--ease-out)'
            }}
          />
        </div>
      </div>
    </Card>
  );
}
