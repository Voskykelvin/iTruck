import Card from '../ui/Card';

export default function MetricCard({ title, value, subtitle, icon: Icon, trend }) {
  return (
    <Card className="metric-card animate-fade-in">
      <div className="metric-card-header">
        <h3 className="metric-card-label">{title}</h3>
        {Icon && (
          <span className="metric-card-icon" aria-hidden="true">
            <Icon size={18} />
          </span>
        )}
      </div>
      <div className="metric-card-value">{value}</div>
      <div className="metric-card-detail">
        {trend !== undefined && trend !== null && (
          <span className={trend >= 0 ? 'metric-trend-positive' : 'metric-trend-negative'}>
            {trend > 0 ? '+' : ''}
            {trend}%
          </span>
        )}
        {subtitle && <span className="metric-card-subtitle">{subtitle}</span>}
      </div>
    </Card>
  );
}
