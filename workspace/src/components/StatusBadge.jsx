import React from 'react';

export default function StatusBadge({ children, tone = 'default' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
