import { User } from 'lucide-react';

export default function Avatar({ name, size = 'md', className = '' }) {
  const initials = name
    ? name
        .split(' ')
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : null;

  return (
    <div className={`avatar avatar-${size} ${className}`}>
      {initials ? initials : <User size={size === 'sm' ? 16 : size === 'lg' ? 32 : 20} />}
    </div>
  );
}
