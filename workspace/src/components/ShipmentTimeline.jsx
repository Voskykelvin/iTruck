import { CheckCircle2 } from 'lucide-react';

export const TIMELINE_STEPS = [
  { key: 'pending', label: 'Booked' },
  { key: 'bidding', label: 'Bidding' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'in_transit', label: 'In Transit' },
  { key: 'delivery_pending', label: 'Awaiting Acceptance' },
  { key: 'delivered', label: 'Delivered' }
];

export default function ShipmentTimeline({ rawStatus, tracking = [] }) {
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === rawStatus);

  return (
    <div className="shipment-timeline">
      {TIMELINE_STEPS.map((step, i) => {
        const isDone = i < currentIndex;
        const isActive = i === currentIndex;
        const trackEntry = tracking.find((t) => t.status === step.key);
        const stateClass = isDone ? 'done' : isActive ? 'active' : 'upcoming';

        return (
          <div key={step.key} className={`timeline-step ${stateClass}`}>
            <div className="timeline-track">
              <div className="timeline-node">{isDone ? <CheckCircle2 size={14} /> : i + 1}</div>
            </div>
            <div className="timeline-content">
              <strong>{step.label}</strong>
              {trackEntry?.queuedAt || trackEntry?.timestamp ? (
                <span className="timeline-time">
                  {new Date(trackEntry.queuedAt || trackEntry.timestamp).toLocaleString([], {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
