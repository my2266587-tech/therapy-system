interface Column {
  key: string;
  label: string;
  width?: string;
}

interface EmptyTableProps {
  columns: Column[];
  emptyMessage?: string;
}

export default function EmptyTable({
  columns,
  emptyMessage = 'אין נתונים להצגה עדיין',
}: EmptyTableProps) {
  return (
    <div
      className="bg-white rounded-xl overflow-hidden"
      style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px 0 rgba(26,38,32,0.06)' }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: '#faf7f2', borderBottom: '1px solid #e5ddd4' }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-3 text-right font-semibold whitespace-nowrap"
                style={{
                  color: '#6b7b6e',
                  fontSize: '0.6875rem',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  ...(col.width ? { width: col.width } : {}),
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              colSpan={columns.length}
              className="px-4 py-16 text-center"
              style={{ color: '#8fa49a' }}
            >
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                  style={{ backgroundColor: '#f2ebe0', color: '#c49438' }}
                >
                  ◌
                </div>
                <span className="text-sm">{emptyMessage}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
