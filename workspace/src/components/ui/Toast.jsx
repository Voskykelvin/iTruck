import { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback(({ title, message, type = 'info', duration = 5000 }) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, title, message, type }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 'var(--space-6)',
          right: 'var(--space-6)',
          zIndex: 'var(--z-toast)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          pointerEvents: 'none'
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

function ToastItem({ toast, onRemove }) {
  const icons = {
    success: <CheckCircle size={20} color="var(--success)" />,
    error: <AlertTriangle size={20} color="var(--danger)" />,
    warning: <AlertTriangle size={20} color="var(--warning)" />,
    info: <Info size={20} color="var(--info)" />
  };

  return (
    <div
      className="glass-panel animate-slide-in-right"
      style={{
        width: 320,
        padding: 'var(--space-3)',
        pointerEvents: 'auto',
        display: 'flex',
        gap: 'var(--space-3)',
        background: 'var(--surface)',
        borderLeft: `4px solid var(--${toast.type === 'error' ? 'danger' : toast.type})`
      }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>{icons[toast.type]}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--ink)' }}>{toast.title}</div>
        )}
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>{toast.message}</div>
      </div>
      <button
        onClick={onRemove}
        className="btn btn-ghost"
        style={{ padding: 4, height: 'auto', alignSelf: 'flex-start' }}
      >
        <X size={16} />
      </button>
    </div>
  );
}
