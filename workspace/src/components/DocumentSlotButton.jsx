import React from 'react';
import StatusBadge from './StatusBadge.jsx';

function documentStatusMeta(status = 'missing', labels = {}) {
  const text = {
    approved: labels.approved || 'Verified',
    pending: labels.pending || 'Under Review',
    rejected: labels.rejected || 'Rejected - Re-upload',
    expired: labels.expired || 'Expired - Re-upload',
    missing: labels.missing || 'Upload'
  };

  if (status === 'approved') return { tone: 'success', text: text.approved };
  if (status === 'pending') return { tone: 'warn', text: text.pending };
  if (status === 'rejected') return { tone: 'danger', text: text.rejected };
  if (status === 'expired') return { tone: 'danger', text: text.expired };
  return { tone: 'default', text: text.missing };
}

function documentSlotBackground(status = 'missing') {
  if (status === 'approved') return 'rgba(132, 204, 22, 0.07)';
  if (status === 'pending') return 'rgba(245, 158, 11, 0.06)';
  if (status === 'rejected' || status === 'expired') return 'rgba(239, 68, 68, 0.05)';
  return 'var(--document-slot-missing-bg)';
}

export default function DocumentSlotButton({
  label,
  status = 'missing',
  busy = false,
  busyText = 'Uploading...',
  disabled = false,
  onClick,
  labels,
  style,
  title
}) {
  const meta = documentStatusMeta(status, labels);
  const isDisabled = disabled || busy;

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--line)',
        background: documentSlotBackground(status),
        color: 'var(--ink)',
        cursor: isDisabled ? 'default' : 'pointer',
        transition: 'border-color 0.15s, background 0.15s',
        ...style
      }}
      title={title}
    >
      <span style={{ fontWeight: 700, flex: 1, textAlign: 'left' }}>{label}</span>
      <StatusBadge tone={meta.tone}>{busy ? busyText : meta.text}</StatusBadge>
    </button>
  );
}
