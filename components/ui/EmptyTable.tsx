interface Column { key: string; label: string; width?: string; }

interface EmptyTableProps {
  columns: Column[];
  emptyMessage?: string;
}

const TH: React.CSSProperties = {
  padding:       '10px 16px',
  textAlign:     'right',
  fontSize:      11,
  fontWeight:    600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color:         '#64748B',
  backgroundColor: '#F8FAFC',
  borderBottom:  '1px solid #E2E8F0',
  whiteSpace:    'nowrap',
};

export default function EmptyTable({ columns, emptyMessage = 'אין נתונים להצגה עדיין' }: EmptyTableProps) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius:    12,
        border:          '1px solid #E2E8F0',
        overflow:        'hidden',
        boxShadow:       '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ ...TH, ...(col.width ? { width: col.width } : {}) }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length} style={{ padding: '64px 24px', textAlign: 'center' }}>
              <div
                style={{
                  width:           40,
                  height:          40,
                  borderRadius:    '50%',
                  backgroundColor: '#F1F5F9',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  margin:          '0 auto 10px',
                  fontSize:        18,
                  color:           '#94A3B8',
                }}
              >
                ○
              </div>
              <p style={{ fontSize: 14, color: '#94A3B8', margin: 0 }}>{emptyMessage}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
