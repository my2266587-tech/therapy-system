'use client';

import type { ValidatedRow } from '@/lib/import/types';

interface FieldDef { key: string; label: string }

interface Props {
  rows:   ValidatedRow[];
  fields: FieldDef[];
  /** Show only rows of these statuses (undefined = all). */
  filter?: ('valid' | 'duplicate' | 'error' | 'warning')[];
}

const C = {
  card: '#FFFFFF', border: '#E8ECF0', text: '#1A2332',
  sub: '#64748B', muted: '#94A3B8',
};

const STATUS_STYLE: Record<string, { bg: string; text: string; border: string; label: string }> = {
  valid:     { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', label: 'תקין' },
  duplicate: { bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', label: 'כפול' },
  error:     { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', label: 'שגיאה' },
  warning:   { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', label: 'אזהרה' },
};

export default function ImportPreviewTable({ rows, fields, filter }: Props) {
  const visible = filter ? rows.filter(r => filter.includes(r.status as 'valid' | 'duplicate' | 'error' | 'warning')) : rows;

  if (visible.length === 0) {
    return (
      <div style={{
        padding: '32px 16px', textAlign: 'center',
        backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
        color: C.muted, fontSize: 13,
      }}>
        אין שורות להצגה
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: 'hidden',
    }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%', borderCollapse: 'collapse', fontSize: 13,
          direction: 'rtl', tableLayout: 'auto',
        }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: `1px solid ${C.border}` }}>
              <th style={th}>#</th>
              <th style={th}>סטטוס</th>
              <th style={{ ...th, minWidth: 180 }}>סיבה</th>
              {fields.map(f => (
                <th key={f.key} style={th}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(r => {
              const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.warning;
              const allIssues = [...r.errors, ...r.warnings];
              return (
                <tr key={r.index} style={{
                  borderBottom: `1px solid #F1F5F9`,
                  backgroundColor: r.status === 'error' ? '#FFFBFB' :
                                   r.status === 'duplicate' ? '#FFFEFA' : C.card,
                }}>
                  <td style={td}>{r.index}</td>
                  <td style={td}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center',
                      padding: '2px 9px', borderRadius: 18, fontSize: 11, fontWeight: 600,
                      backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
                    }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={{
                    ...td, maxWidth: 320, whiteSpace: 'normal',
                    color: r.status === 'valid' ? C.muted :
                           r.status === 'duplicate' ? '#92400E' : '#DC2626',
                    fontWeight: r.status !== 'valid' ? 500 : 400,
                  }}
                  title={allIssues.length > 1 ? allIssues.join(' · ') : undefined}>
                    {r.reason ?? (r.warnings.length > 0 ? r.warnings[0] : '—')}
                    {r.errors.length > 1 && (
                      <span style={{ display: 'block', fontSize: 11, color: C.muted, fontWeight: 400, marginTop: 2 }}>
                        +{r.errors.length - 1} שגיאות נוספות
                      </span>
                    )}
                  </td>
                  {fields.map(f => {
                    const v = r.values[f.key];
                    return (
                      <td key={f.key} style={{ ...td, color: v == null ? C.muted : C.text }}>
                        {v == null ? '—' : String(v)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right', fontSize: 11,
  fontWeight: 600, color: '#64748B',
  textTransform: 'uppercase', letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'right',
  verticalAlign: 'top', whiteSpace: 'nowrap',
};
