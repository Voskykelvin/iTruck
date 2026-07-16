function cellContent(column, row) {
  return column.cell ? column.cell(row) : row[column.accessor];
}

function MobileLoadingCards({ columns }) {
  return (
    <div className="data-table-mobile" aria-label="Loading rows">
      {[1, 2, 3].map((row) => (
        <div className="data-table-card" key={row}>
          {columns.slice(0, 4).map((column, index) => (
            <div className="data-table-card-row" key={`${column.accessor || column.header}-${index}`}>
              <span className="data-table-card-label">{column.header}</span>
              <span className="skeleton skeleton-text data-table-card-skeleton" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function DataTable({ columns, data, loading, onRowClick }) {
  if (loading) {
    return (
      <div className="data-table-shell glass-panel">
        <div className="data-table-desktop">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column, index) => (
                  <th key={column.accessor || index} style={{ textAlign: column.align || 'left' }}>
                    <div className="skeleton skeleton-text" style={{ width: 80, margin: 0 }} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((row) => (
                <tr key={row}>
                  {columns.map((column, index) => (
                    <td key={column.accessor || index}>
                      <div className="skeleton skeleton-text" style={{ width: index === 0 ? 120 : 60, margin: 0 }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MobileLoadingCards columns={columns} />
      </div>
    );
  }

  if (!data || data.length === 0) return null;

  const activateRow = (row) => {
    if (onRowClick) onRowClick(row);
  };

  return (
    <div className="data-table-shell glass-panel">
      <div className="data-table-desktop">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column.accessor || index} style={{ textAlign: column.align || 'left' }} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={row.id || rowIndex}
                onClick={() => activateRow(row)}
                className={onRowClick ? 'data-table-clickable-row' : undefined}
              >
                {columns.map((column, columnIndex) => (
                  <td key={column.accessor || columnIndex} style={{ textAlign: column.align || 'left' }}>
                    {cellContent(column, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-table-mobile">
        {data.map((row, rowIndex) => (
          <div
            className={`data-table-card ${onRowClick ? 'data-table-card-clickable' : ''}`}
            key={row.id || rowIndex}
            onClick={() => activateRow(row)}
            onKeyDown={(event) => {
              if (onRowClick && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                activateRow(row);
              }
            }}
            role={onRowClick ? 'button' : undefined}
            tabIndex={onRowClick ? 0 : undefined}
          >
            {columns.map((column, columnIndex) => (
              <div className="data-table-card-row" key={column.accessor || columnIndex}>
                <span className="data-table-card-label">{column.header}</span>
                <div className="data-table-card-value" style={{ textAlign: column.align || 'right' }}>
                  {cellContent(column, row)}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
