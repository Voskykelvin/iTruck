import { useEffect, useId, useRef } from 'react';

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  busy = false,
  onConfirm,
  onCancel
}) {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    cancelRef.current?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section
        className="modal-card confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <div className="modal-card-head">
          <h3 id={titleId}>{title}</h3>
        </div>
        <div className="modal-card-body">
          <p id={descriptionId}>{description}</p>
          <div className="confirm-dialog-actions">
            <button ref={cancelRef} className="ghost" type="button" disabled={busy} onClick={onCancel}>
              {cancelLabel}
            </button>
            <button className="danger-action" type="button" disabled={busy} onClick={onConfirm}>
              {busy ? 'Working...' : confirmLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
