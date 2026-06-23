import { ClipboardCheck } from 'lucide-react';

export default function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <ClipboardCheck size={24} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}
