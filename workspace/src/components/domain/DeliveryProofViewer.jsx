import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import { FileSignature, ShieldCheck, MapPin } from 'lucide-react';
import { timeFormat } from '../../utils/helpers';

export default function DeliveryProofViewer({ shipmentId }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['commercial', 'bookings', 'delivery-proof', shipmentId],
    queryFn: () => api.getDeliveryProof(shipmentId)
  });

  if (isLoading) return null;
  if (isError || !data?.proof) return null;

  const { proof, assets } = data;

  return (
    <Card className="stack">
      <div className="row-between">
        <h3 className="eyebrow" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <FileSignature size={16} /> Delivery Proof
        </h3>
        <Badge variant="success" icon={ShieldCheck}>
          Verified
        </Badge>
      </div>

      <div
        className="text-secondary"
        style={{
          fontSize: 'var(--text-sm)',
          background: 'var(--surface-2)',
          padding: 'var(--space-3)',
          borderRadius: 'var(--radius-sm)'
        }}
      >
        <div className="row" style={{ gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <strong>Chain Hash:</strong>
          <span className="mono" style={{ fontSize: '10px', wordBreak: 'break-all' }}>
            {proof.recordHash}
          </span>
        </div>
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          <strong>Verified At:</strong>
          <span>{timeFormat(proof.verification?.verifiedAt || proof.createdAt)}</span>
        </div>
      </div>

      <div className="grid-2">
        {assets?.map((asset) => (
          <div
            key={asset.id}
            style={{
              position: 'relative',
              aspectRatio: '1',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              border: '1px solid var(--border)'
            }}
          >
            <img src={asset.url} alt="Delivery Proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            {Number.isFinite(asset.location?.lat) && Number.isFinite(asset.location?.lng) && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: 'var(--space-1)',
                  background: 'rgba(0,0,0,0.6)',
                  color: 'white',
                  fontSize: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <MapPin size={10} /> {asset.location.lat.toFixed(4)}, {asset.location.lng.toFixed(4)}
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
