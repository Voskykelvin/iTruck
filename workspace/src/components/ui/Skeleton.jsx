export function Skeleton({ className = '', style = {} }) {
  return <div className={`skeleton ${className}`} style={style} />;
}

export function SkeletonText({ lines = 1, className = '', style = {} }) {
  return (
    <div className={className} style={{ width: '100%', ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton skeleton-text" />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ className = '', style = {} }) {
  return <div className={`skeleton skeleton-avatar ${className}`} style={style} />;
}

export default Skeleton;
