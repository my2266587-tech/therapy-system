interface PageHeaderProps {
  title: string;
  description?: string;
  buttonLabel?: string;
  onAdd?: () => void;
  showButton?: boolean;
}

export default function PageHeader({
  title,
  description,
  buttonLabel = 'הוסף חדש',
  onAdd,
  showButton = true,
}: PageHeaderProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: 0, lineHeight: 1.2 }}>
          {title}
        </h1>
        {description && (
          <p style={{ fontSize: 14, color: '#64748B', marginTop: 4, margin: '4px 0 0' }}>
            {description}
          </p>
        )}
      </div>

      {showButton && (
        <button
          onClick={onAdd}
          style={{
            display:         'flex',
            alignItems:      'center',
            gap:             6,
            padding:         '9px 18px',
            borderRadius:    9,
            border:          'none',
            backgroundColor: '#0F766E',
            color:           '#FFFFFF',
            fontSize:        14,
            fontWeight:      600,
            cursor:          'pointer',
            whiteSpace:      'nowrap',
            flexShrink:      0,
            transition:      'all 0.12s',
            boxShadow:       '0 1px 3px rgba(15,118,110,0.3)',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#0D6E67';
            e.currentTarget.style.boxShadow = '0 3px 10px rgba(15,118,110,0.35)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#0F766E';
            e.currentTarget.style.boxShadow = '0 1px 3px rgba(15,118,110,0.3)';
            e.currentTarget.style.transform = '';
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          {buttonLabel}
        </button>
      )}
    </div>
  );
}
