'use client';

/**
 * Monthly hours report — single-file picker UI.
 *
 *   - Year + month dropdowns (default = previous month).
 *   - "הפק דוח" produces ONE xlsx with a worksheet per staff member,
 *     identical to the file the monthly cron emails on the 1st of the
 *     following month.
 *   - No multi-select, no ZIP, no per-staff exports.
 */

import { useCallback, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const HEB_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל',
  'מאי',   'יוני',   'יולי', 'אוגוסט',
  'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

type Status =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'done';  message: string }
  | { kind: 'error'; message: string };

export default function MonthlyReportsPage() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [year,  setYear]  = useState(prev.getFullYear());
  const [month, setMonth] = useState(prev.getMonth() + 1);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = useCallback(async () => {
    if (status.kind === 'pending') return;
    setStatus({ kind: 'pending' });

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setStatus({ kind: 'error', message: 'יש להתחבר מחדש' });
      return;
    }

    try {
      const res = await fetch(
        `/api/reports/monthly-excel/download?year=${year}&month=${month}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        // Try JSON first (the route's own error shape), then fall back
        // to raw text (Next's HTML error page is still better signal
        // than a bare status code). Last resort: status only.
        let msg = `שגיאה (${res.status})`;
        const raw = await res.text().catch(() => '');
        if (raw) {
          try {
            const j = JSON.parse(raw);
            msg = j?.error ?? msg;
          } catch {
            // Not JSON — surface a short snippet so server-side errors
            // (auth, env, header construction) are at least visible.
            const trimmed = raw.trim().slice(0, 240);
            if (trimmed) msg = `${msg} — ${trimmed}`;
          }
        }
        setStatus({ kind: 'error', message: msg });
        return;
      }
      const blob = await res.blob();
      const filename = extractFilename(res.headers.get('content-disposition'))
        ?? `monthly-report-${year}-${String(month).padStart(2, '0')}.xlsx`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      const sessions = res.headers.get('X-Report-Total-Sessions') ?? '?';
      const days     = res.headers.get('X-Report-Days') ?? '?';
      setStatus({
        kind:    'done',
        message: `הקובץ הורד · ${sessions} פגישות · ${days} ימים`,
      });
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message });
    }
  }, [status.kind, year, month]);

  const running = status.kind === 'pending';

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            דוחות חודשיים
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            הפקת קובץ Excel חודשי יחיד — שורה לכל יום בחודש עם כל הפגישות
            שהתקיימו. אותו קובץ שנשלח אוטומטית במייל בכל 1 בחודש.
          </p>
        </div>

        <Section title="בחירת חודש">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Select
              value={String(month)}
              onChange={v => setMonth(+v)}
              disabled={running}
              options={HEB_MONTHS.map((label, i) => ({ value: String(i + 1), label }))}
              minWidth={140}
            />
            <Select
              value={String(year)}
              onChange={v => setYear(+v)}
              disabled={running}
              options={yearOptions.map(y => ({ value: String(y), label: String(y) }))}
              minWidth={100}
            />
            <span style={{ fontSize: 12, color: C.muted, marginInlineStart: 8 }}>
              ברירת מחדל: החודש הקודם.
            </span>
          </div>
        </Section>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.border}`,
        }}>
          <StatusLine status={status} />
          <button
            onClick={generate}
            disabled={running}
            style={{
              padding: '10px 26px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              backgroundColor: running ? '#CBD5E1' : C.accent,
              color: '#FFFFFF', border: 'none',
              cursor: running ? 'not-allowed' : 'pointer',
              boxShadow: running ? 'none' : '0 2px 8px rgba(13,148,136,0.22)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'all 0.12s',
            }}
          >
            {running && <Spinner />}
            {running ? 'מפיק דוח...' : 'הפק דוח'}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );
}

/* ── pieces ───────────────────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 22 }}>
      <h2 style={{
        fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 10px',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Select({
  value, onChange, options, disabled, minWidth,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
  minWidth?: number;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        minWidth: minWidth ?? 120,
        padding: '9px 14px', borderRadius: 9,
        border: `1px solid ${C.border}`, backgroundColor: C.card,
        fontSize: 14, color: C.text, fontFamily: 'inherit',
        cursor: disabled ? 'not-allowed' : 'pointer', outline: 'none',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function StatusLine({ status }: { status: Status }) {
  if (status.kind === 'idle') {
    return <span style={{ fontSize: 12, color: C.muted }}>בחרי חודש ולחצי "הפק דוח"</span>;
  }
  if (status.kind === 'pending') {
    return <span style={{ fontSize: 12, color: C.muted }}>שולפת נתונים ומייצרת את הקובץ...</span>;
  }
  if (status.kind === 'error') {
    return (
      <span style={{
        fontSize: 12, color: '#DC2626', backgroundColor: '#FEF2F2',
        border: '1px solid #FECACA', borderRadius: 8, padding: '5px 11px',
      }}>
        ⚠ {status.message}
      </span>
    );
  }
  return (
    <span style={{
      fontSize: 12, color: '#16A34A', backgroundColor: '#F0FDF4',
      border: '1px solid #BBF7D0', borderRadius: 8, padding: '5px 11px',
    }}>
      ✓ {status.message}
    </span>
  );
}

function Spinner() {
  return (
    <span style={{
      width: 12, height: 12, borderRadius: '50%',
      border: '2px solid rgba(255,255,255,0.4)',
      borderTopColor: '#FFFFFF',
      animation: 'spin 0.7s linear infinite',
      display: 'inline-block',
    }} />
  );
}

/* ── helpers ──────────────────────────────────────────────────────── */

function extractFilename(disposition: string | null): string | null {
  if (!disposition) return null;
  const m = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}
