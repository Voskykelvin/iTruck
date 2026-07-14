export default function Card({ children, className = '', padding = 'var(--space-5)', onClick, ...props }) {
  const baseClass = onClick ? 'glass-card' : 'glass-panel';

  return (
    <div
      className={`${baseClass} ${className}`}
      style={{ padding, ...(onClick ? { cursor: 'pointer' } : {}) }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  );
}
