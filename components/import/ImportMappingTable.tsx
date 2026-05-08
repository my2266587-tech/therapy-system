'use client';

interface FieldDef {
  key:      string;
  label:    string;
  required: boolean;
  hint:     string | null;
}

interface Props {
  headers:   string[];
  fields:    FieldDef[];
  mapping:   Record<string, string>;     // header → field.key
  onChange:  (next: Record<string, string>) => void;
}

const C = {
  card: '#FFFFFF', border: '#E8ECF0', text: '#1A2332',
  sub: '#64748B', muted: '#94A3B8',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
};

const NONE = '__none__';

export default function ImportMappingTable({ headers, fields, mapping, onChange }: Props) {
  const usedFieldKeys = new Set(Object.values(mapping));

  function setHeader(header: string, fieldKey: string) {
    const next = { ...mapping };
    if (fieldKey === NONE) delete next[header];
    else                   next[header] = fieldKey;
    onChange(next);
  }

  return (
    <div style={{
      backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr auto 1fr',
        padding: '10px 16px', fontSize: 11, fontWeight: 600, color: C.muted,
        textTransform: 'uppercase', letterSpacing: '0.06em',
        backgroundColor: '#F8FAFC', borderBottom: `1px solid ${C.border}`,
      }}>
        <span>עמודה בקובץ</span>
        <span style={{ padding: '0 16px' }}>→</span>
        <span>שדה במערכת</span>
      </div>

      {headers.map((h, i) => {
        const current = mapping[h] ?? NONE;
        const matched = current !== NONE;
        return (
          <div key={`${h}-${i}`} style={{
            display: 'grid', gridTemplateColumns: '1fr auto 1fr',
            alignItems: 'center', gap: 0,
            padding: '10px 16px',
            borderBottom: i < headers.length - 1 ? `1px solid #F1F5F9` : 'none',
          }}>
            <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{h || '—'}</span>
            <span style={{ padding: '0 16px', color: matched ? C.accent : C.muted, fontSize: 14 }}>
              ←
            </span>
            <select
              value={current}
              onChange={e => setHeader(h, e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px', borderRadius: 8,
                border: `1px solid ${matched ? C.accentRim : C.border}`,
                backgroundColor: matched ? C.accentSub : C.card,
                color: matched ? C.accent : C.sub,
                fontSize: 13, fontWeight: matched ? 600 : 400,
                cursor: 'pointer', outline: 'none',
                fontFamily: 'inherit',
              }}
            >
              <option value={NONE}>— דלגי על עמודה זו —</option>
              {fields.map(f => {
                const usedElsewhere = usedFieldKeys.has(f.key) && current !== f.key;
                return (
                  <option key={f.key} value={f.key} disabled={usedElsewhere}>
                    {f.label}{f.required ? ' *' : ''}{usedElsewhere ? ' (כבר ממופה)' : ''}
                  </option>
                );
              })}
            </select>
          </div>
        );
      })}
    </div>
  );
}
