'use client';

/**
 * Monthly hours report — picker UI.
 *
 *   - Year + month dropdowns (default = previous month, the typical use
 *     case is "report for the month that just ended").
 *   - Multi-select of staff members. Defaults to none-selected so the
 *     user has to make a deliberate choice. "בחירת הכל" / "ניקוי" chips.
 *   - "הפק דוחות" button kicks off one fetch per selected staff,
 *     sequentially (avoids hammering the function and keeps a clear
 *     per-row progress indicator). Each successful response triggers a
 *     browser download of the generated xlsx.
 *
 * No ZIP, no email, no cron — those are explicitly outside the scope
 * of the first iteration.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { STAFF_ROLE_STYLE } from '@/lib/staffRoles';
import type { StaffMember } from '@/types';

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

type StaffPickerRow = Pick<StaffMember, 'id' | 'full_name' | 'role'>;

type GenStatus = 'idle' | 'pending' | 'done' | 'error';

export default function MonthlyReportsPage() {
  const now = new Date();
  // Default: previous month
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const [year,  setYear]  = useState(prev.getFullYear());
  const [month, setMonth] = useState(prev.getMonth() + 1);

  const [staff, setStaff]       = useState<StaffPickerRow[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [running, setRunning] = useState(false);
  const [perStaff, setPerStaff] = useState<Record<string, { status: GenStatus; message?: string }>>({});

  /* ── load staff list ────────────────────────────────────────── */
  useEffect(() => {
    supabase
      .from('staff')
      .select('id, full_name, role')
      .order('full_name')
      .then(({ data, error }) => {
        if (!error) setStaff((data ?? []) as StaffPickerRow[]);
        setLoading(false);
      });
  }, []);

  /* ── year picker options: current year ± 2 ──────────────────── */
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  }, [now]);

  /* ── selection helpers ──────────────────────────────────────── */
  const allIds = useMemo(() => staff.map(s => s.id), [staff]);
  const toggle = useCallback((id: string) => {
    if (running) return;
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }, [running]);
  const selectAll = useCallback(() => { if (!running) setSelected(new Set(allIds)); }, [allIds, running]);
  const clearAll  = useCallback(() => { if (!running) setSelected(new Set()); },     [running]);

  /* ── generate ───────────────────────────────────────────────── */
  const generate = useCallback(async () => {
    if (running || selected.size === 0) return;
    setRunning(true);
    setPerStaff({});

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) {
      setPerStaff({ '*': { status: 'error', message: 'יש להתחבר מחדש' } });
      setRunning(false);
      return;
    }

    const ids = [...selected];

    // Sequential — keeps per-row progress clear and is gentle on the
    // serverless function. For huge selections the user can re-pick.
    for (const id of ids) {
      setPerStaff(prev => ({ ...prev, [id]: { status: 'pending' } }));
      try {
        const res = await fetch(
          `/api/reports/monthly-excel/${id}?year=${year}&month=${month}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) {
          let msg = `שגיאה (${res.status})`;
          try { const j = await res.json(); msg = j?.error ?? msg; } catch {}
          setPerStaff(prev => ({ ...prev, [id]: { status: 'error', message: msg } }));
          continue;
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

        const sessions = res.headers.get('X-Report-Sessions') ?? '0';
        const days     = res.headers.get('X-Report-Days')     ?? '0';
        setPerStaff(prev => ({
          ...prev,
          [id]: { status: 'done', message: `${sessions} פגישות · ${days} ימים` },
        }));
      } catch (e) {
        setPerStaff(prev => ({
          ...prev,
          [id]: { status: 'error', message: (e as Error).message },
        }));
      }
    }

    setRunning(false);
  }, [running, selected, year, month]);

  /* ── render ─────────────────────────────────────────────────── */

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 880, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 26 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            דוחות חודשיים
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            הפקת קבצי Excel חודשיים לכל איש צוות, לפי תבנית קיימת.
          </p>
        </div>

        {/* Step 1 — period */}
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

        {/* Step 2 — staff multi-select */}
        <Section title="בחירת אנשי צוות">
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10, gap: 8,
          }}>
            <span style={{ fontSize: 12, color: C.muted }}>
              נבחרו {selected.size} מתוך {staff.length}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <SmallChip onClick={selectAll} disabled={running || staff.length === 0}>
                בחירת הכל
              </SmallChip>
              <SmallChip onClick={clearAll} disabled={running || selected.size === 0}>
                ניקוי
              </SmallChip>
            </div>
          </div>

          {loading ? (
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>טוען רשימת צוות...</p>
          ) : staff.length === 0 ? (
            <EmptyHint>אין אנשי צוות במערכת.</EmptyHint>
          ) : (
            <div style={{
              backgroundColor: C.card, borderRadius: 12,
              border: `1px solid ${C.border}`, overflow: 'hidden',
            }}>
              {staff.map((s, i) => {
                const checked = selected.has(s.id);
                const status  = perStaff[s.id];
                const rs      = STAFF_ROLE_STYLE[s.role] ?? STAFF_ROLE_STYLE.other;
                return (
                  <label
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '11px 16px', cursor: running ? 'default' : 'pointer',
                      borderBottom: i < staff.length - 1 ? `1px solid #F1F5F9` : 'none',
                      backgroundColor: checked ? C.accentSub : C.card,
                      transition: 'background-color 0.1s',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      disabled={running}
                      style={{ flexShrink: 0 }}
                    />
                    <span style={{
                      flex: 1, minWidth: 0,
                      fontSize: 14, fontWeight: 500, color: C.text,
                    }}>
                      {s.full_name}
                    </span>
                    <span style={{
                      flexShrink: 0, padding: '2px 9px', borderRadius: 14,
                      fontSize: 11, fontWeight: 600,
                      backgroundColor: rs.bg, color: rs.text, border: `1px solid ${rs.border}`,
                    }}>
                      {rs.label}
                    </span>
                    {status && <StatusBadge status={status.status} message={status.message} />}
                  </label>
                );
              })}
            </div>
          )}
        </Section>

        {/* Generate */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12,
          marginTop: 24, paddingTop: 18, borderTop: `1px solid ${C.border}`,
        }}>
          <span style={{ fontSize: 12, color: C.muted }}>
            {selected.size === 0
              ? 'בחרי אנשי צוות כדי להמשיך'
              : `${selected.size} דוחות יורדו לפי הסדר`}
          </span>
          <button
            onClick={generate}
            disabled={running || selected.size === 0}
            style={{
              padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 600,
              backgroundColor: running || selected.size === 0 ? '#CBD5E1' : C.accent,
              color: '#FFFFFF', border: 'none',
              cursor: running || selected.size === 0 ? 'not-allowed' : 'pointer',
              boxShadow: running || selected.size === 0 ? 'none' : '0 2px 8px rgba(13,148,136,0.22)',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'all 0.12s',
            }}
          >
            {running && <Spinner />}
            {running ? 'מפיק דוחות...' : 'הפק דוחות'}
          </button>
        </div>

        {perStaff['*']?.status === 'error' && (
          <div style={{
            marginTop: 16, padding: '10px 14px', borderRadius: 10,
            backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
            color: '#DC2626', fontSize: 13,
          }}>
            {perStaff['*'].message}
          </div>
        )}

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

function SmallChip({
  onClick, disabled, children,
}: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '5px 12px', borderRadius: 16, fontSize: 12, fontWeight: 500,
        backgroundColor: disabled ? '#F1F5F9' : C.card,
        color: disabled ? C.muted : C.sub,
        border: `1px solid ${C.border}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.12s',
      }}
      onMouseEnter={e => {
        if (disabled) return;
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = C.accentRim; el.style.color = C.accent;
      }}
      onMouseLeave={e => {
        if (disabled) return;
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = C.border; el.style.color = C.sub;
      }}
    >
      {children}
    </button>
  );
}

function StatusBadge({ status, message }: { status: GenStatus; message?: string }) {
  if (status === 'idle') return null;

  const palette = {
    pending: { bg: '#EFF6FF', fg: '#1D4ED8', border: '#BFDBFE', label: 'יוצר...' },
    done:    { bg: '#F0FDF4', fg: '#16A34A', border: '#BBF7D0', label: '✓ נוצר' },
    error:   { bg: '#FEF2F2', fg: '#DC2626', border: '#FECACA', label: '⚠ שגיאה' },
  }[status];

  return (
    <span
      title={message ?? ''}
      style={{
        flexShrink: 0,
        padding: '2px 9px', borderRadius: 14,
        fontSize: 11, fontWeight: 600,
        backgroundColor: palette.bg, color: palette.fg,
        border: `1px solid ${palette.border}`,
      }}
    >
      {status === 'done' && message ? `${palette.label} · ${message}` : palette.label}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      padding: '24px 16px', textAlign: 'center',
      backgroundColor: C.card, borderRadius: 12, border: `1px dashed #CBD5E1`,
      color: C.muted, fontSize: 13,
    }}>
      {children}
    </div>
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
