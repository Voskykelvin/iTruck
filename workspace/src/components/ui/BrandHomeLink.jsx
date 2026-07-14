import { Link } from 'react-router-dom';
import { Truck } from 'lucide-react';

export default function BrandHomeLink({ compact = false, iconOnly = false, className = '' }) {
  return (
    <Link
      to="/"
      className={`brand-home-link ${compact ? 'brand-home-link-compact' : ''} ${className}`.trim()}
      aria-label="iTruck homepage"
    >
      <span className="brand-home-mark" aria-hidden="true">
        {iconOnly ? <Truck size={compact ? 18 : 24} /> : 'iT'}
      </span>
      {!iconOnly && <span className="brand-home-name">iTruck</span>}
    </Link>
  );
}
