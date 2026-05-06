interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  accent?: boolean;
}

export default function StatCard({ title, value, description, accent }: StatCardProps) {
  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius:    12,
        border:          `1px solid ${accent ? '#99F6E4' : '#E2E8F0'}`,
        boxShadow:       accent
          ? '0 1px 4px rgba(15,118,110,0.08)'
          : '0 1px 3px rgba(0,0,0,0.05)',
        padding:         '20px 22px',
        position:        'relative',
        overflow:        'hidden',
      }}
    >
      {/* Accent top bar */}
      {accent && (
        <div
          style={{
            position:        'absolute',
            top:             0,
            right:           0,
            left:            0,
            height:          3,
            backgroundColor: '#0F766E',
            borderRadius:    '12px 12px 0 0',
          }}
        />
      )}

      <p
        style={{
          fontSize:      11,
          fontWeight:    600,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color:         '#64748B',
          margin:        '0 0 10px',
        }}
      >
        {title}
      </p>
      <p
        style={{
          fontSize:   30,
          fontWeight: 700,
          color:      accent ? '#0F766E' : '#0F172A',
          lineHeight: 1,
          margin:     '0 0 6px',
        }}
      >
        {value}
      </p>
      {description && (
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
          {description}
        </p>
      )}
    </div>
  );
}
