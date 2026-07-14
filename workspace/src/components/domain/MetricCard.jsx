import Card from '../ui/Card';

export default function MetricCard({ title, value, subtitle, icon: Icon, trend }) {
  return (
    <Card className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className="row-between">
        <h3 className="eyebrow" style={{ margin: 0 }}>
          {title}
        </h3>
        {Icon && <Icon size={20} color="var(--brand-mid)" />}
      </div>

      <div>
        <div style={{ fontSize: 'var(--text-3xl)', fontWeight: 700, color: 'var(--ink)' }}>{value}</div>

        {(subtitle || trend) && (
          <div className="row" style={{ marginTop: 'var(--space-1)' }}>
            {trend && (
              <span
                style={{
                  color: trend > 0 ? 'var(--success)' : 'var(--danger)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)'
                }}
              >
                {trend > 0 ? '+' : ''}
                {trend}%
              </span>
            )}
            {subtitle && (
              <span className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                {subtitle}
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
