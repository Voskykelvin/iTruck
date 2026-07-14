export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div
      className="stack animate-fade-in"
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-12) var(--space-4)',
        textAlign: 'center'
      }}
    >
      {Icon && (
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--surface-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-2)'
          }}
        >
          <Icon size={32} />
        </div>
      )}
      <h3 style={{ fontSize: 'var(--text-lg)' }}>{title}</h3>
      <p style={{ maxWidth: 400, margin: '0 auto' }}>{description}</p>
      {action && <div style={{ marginTop: 'var(--space-4)' }}>{action}</div>}
    </div>
  );
}
