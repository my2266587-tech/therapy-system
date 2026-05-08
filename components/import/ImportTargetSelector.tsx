'use client';

interface TargetCard {
  key:         string;
  label:       string;
  description: string;
  fieldsCount: number;
}

interface Props {
  targets:  TargetCard[];
  selected: string | null;
  onPick:   (key: string) => void;
}

const C = {
  card: '#FFFFFF', border: '#E8ECF0', text: '#1A2332',
  sub: '#64748B', muted: '#94A3B8',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
};

export default function ImportTargetSelector({ targets, selected, onPick }: Props) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
      gap: 12,
    }}>
      {targets.map(t => {
        const active = selected === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onPick(t.key)}
            style={{
              textAlign: 'right',
              backgroundColor: active ? C.accentSub : C.card,
              border: `1px solid ${active ? C.accent : C.border}`,
              borderTop: `2px solid ${active ? C.accent : 'transparent'}`,
              borderRadius: 12,
              padding: '16px 18px',
              cursor: 'pointer',
              transition: 'all 0.12s',
              boxShadow: active ? '0 4px 12px rgba(13,148,136,0.10)' : '0 1px 3px rgba(0,0,0,0.04)',
            }}
            onMouseEnter={e => {
              if (active) return;
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = C.accentRim;
              el.style.boxShadow = '0 4px 12px rgba(13,148,136,0.08)';
            }}
            onMouseLeave={e => {
              if (active) return;
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = C.border;
              el.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          >
            <p style={{
              fontSize: 15, fontWeight: 700, color: active ? C.accent : C.text,
              margin: 0, lineHeight: 1.3,
            }}>
              {t.label}
            </p>
            <p style={{
              fontSize: 12, color: C.sub, margin: '6px 0 12px', lineHeight: 1.5,
            }}>
              {t.description}
            </p>
            <span style={{
              fontSize: 11, color: C.muted, fontWeight: 500,
            }}>
              {t.fieldsCount} שדות
            </span>
          </button>
        );
      })}
    </div>
  );
}
