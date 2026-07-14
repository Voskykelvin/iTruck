export default function ProgressRing({ progress, size = 60, stroke = 6, color = 'var(--brand)' }) {
  const normalizedRadius = (size - stroke) / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg height={size} width={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          stroke="var(--surface-2)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />
        <circle
          stroke={color}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={circumference + ' ' + circumference}
          style={{ strokeDashoffset, transition: 'stroke-dashoffset 0.5s ease-out' }}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={size / 2}
          cy={size / 2}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.25,
          fontWeight: 700,
          color: 'var(--ink)'
        }}
      >
        {Math.round(progress)}%
      </div>
    </div>
  );
}
