export default function DataTable({ columns, data, loading, onRowClick }) {
  if (loading) {
    return (
      <div className="glass-panel" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={i}
                  style={{
                    padding: 'var(--space-4)',
                    textAlign: col.align || 'left',
                    borderBottom: '1px solid var(--border)'
                  }}
                >
                  <div className="skeleton skeleton-text" style={{ width: 80, margin: 0 }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((row) => (
              <tr key={row}>
                {columns.map((col, i) => (
                  <td key={i} style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
                    <div className="skeleton skeleton-text" style={{ width: i === 0 ? 120 : 60, margin: 0 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return null; // Should be wrapped in an EmptyState by the parent
  }

  return (
    <div className="glass-panel" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ background: 'var(--surface-2)' }}>
          <tr>
            {columns.map((col, i) => (
              <th
                key={i}
                style={{
                  padding: 'var(--space-3) var(--space-4)',
                  textAlign: col.align || 'left',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-secondary)',
                  fontWeight: 600,
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em'
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIndex) => (
            <tr
              key={row.id || rowIndex}
              onClick={() => onRowClick && onRowClick(row)}
              style={{
                cursor: onRowClick ? 'pointer' : 'default',
                transition: 'background var(--duration-fast)',
                borderBottom: rowIndex === data.length - 1 ? 'none' : '1px solid var(--border)'
              }}
              onMouseEnter={(e) => onRowClick && (e.currentTarget.style.background = 'var(--surface-glass-hover)')}
              onMouseLeave={(e) => onRowClick && (e.currentTarget.style.background = 'transparent')}
            >
              {columns.map((col, colIndex) => (
                <td
                  key={colIndex}
                  style={{
                    padding: 'var(--space-4)',
                    textAlign: col.align || 'left',
                    color: 'var(--ink)',
                    fontSize: 'var(--text-sm)'
                  }}
                >
                  {col.cell ? col.cell(row) : row[col.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
