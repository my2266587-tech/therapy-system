interface FormGroupProps {
  title: string;
  children: React.ReactNode;
}

export default function FormGroup({ title, children }: FormGroupProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <h3
          style={{
            fontSize:      11,
            fontWeight:    700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color:         '#64748B',
            margin:        0,
            whiteSpace:    'nowrap',
          }}
        >
          {title}
        </h3>
        <div style={{ flex: 1, height: 1, backgroundColor: '#E2E8F0' }} />
      </div>
      {children}
    </div>
  );
}
