'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatGregorian, hebrewLong, PRESETS } from '@/lib/dateUtils';
import DateDisplay from '@/components/ui/DateDisplay';

interface UpcomingSession {
  id: string;
  date: string;
  patient: { full_name: string } | null;
}

interface DashData {
  todaySessions:     number;
  activePatients:    number;
  weekSessions:      number;
  upcoming:          UpcomingSession[];
}

interface MonthlySummaryRow {
  id:         string;
  date:       string;
  start_time: string | null;
  end_time:   string | null;
  notes:      string | null;
  patient_id: string | null;
  patient:    { full_name: string } | null;
  /** Cached duration in minutes (end - start). null if either time is missing. */
  durationMin: number | null;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

function topBarDate() {
  const now = new Date();
  return `${formatGregorian(now, PRESETS.weekday)} · ${hebrewLong(now)}`;
}

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const shortcuts = [
  { href: '/patients',   label: 'מטופלות'   },
  { href: '/sessions',   label: 'פגישות'    },
  { href: '/summaries',  label: 'סיכומים'   },
  { href: '/quarterly',  label: 'רבעוני'    },
  { href: '/tasks',      label: 'משימות'    },
  { href: '/staff',      label: 'צוות'      },
];

const HEB_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל',
  'מאי',   'יוני',   'יולי', 'אוגוסט',
  'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

/**
 * Parse 'HH:MM' or 'HH:MM:SS' to minutes-since-midnight.
 * Returns null on malformed input — caller treats the slot as unmeasured.
 */
function parseTimeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = +m[1], mn = +m[2];
  if (h > 23 || mn > 59) return null;
  return h * 60 + mn;
}

/** Format minutes as "H:MM" (e.g. 92 → "1:32"). */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min - h * 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** Format minutes as a decimal hours figure with one digit, e.g. "12.5". */
function formatHoursDecimal(min: number): string {
  return (min / 60).toFixed(1);
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end:   `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData>({
    todaySessions: 0, activePatients: 0, weekSessions: 0,
    upcoming: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const sun   = new Date(); sun.setDate(sun.getDate() - sun.getDay());
      const sat   = new Date(sun); sat.setDate(sun.getDate() + 6);
      const fmt   = (d: Date) => d.toISOString().slice(0, 10);

      const [pts, todaySess, weekSess, upcoming] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'planned'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('date', fmt(sun)).lte('date', fmt(sat)).eq('status', 'planned'),
        supabase.from('sessions').select('id, date, patient:patient_id(full_name)').gte('date', today).eq('status', 'planned').order('date').limit(6),
      ]);

      setData({
        todaySessions:  todaySess.count  ?? 0,
        activePatients: pts.count        ?? 0,
        weekSessions:   weekSess.count   ?? 0,
        upcoming:       (upcoming.data   ?? []) as unknown as UpcomingSession[],
      });
      setLoading(false);
    }
    load();
  }, []);

  const kpis = [
    { label: 'פגישות היום',    value: data.todaySessions,     accent: true,  href: '/sessions?filter=today'   },
    { label: 'מטופלות פעילות', value: data.activePatients,    accent: false, href: '/patients?status=active'  },
    { label: 'פגישות השבוע',   value: data.weekSessions,      accent: false, href: '/sessions?filter=week'    },
  ];

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 1140, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 36 }}>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 6px' }}>
            {getGreeting()} · {topBarDate()}
          </p>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '-0.4px' }}>
            מחר אחר – שדה חמד
          </h1>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
          {kpis.map(k => (
            <Link key={k.label} href={k.href} style={{
              display: 'block', textDecoration: 'none',
              backgroundColor: C.card, borderRadius: 14,
              border: `1px solid ${k.accent ? C.accentRim : C.border}`,
              boxShadow: k.accent ? '0 2px 10px rgba(13,148,136,0.08)' : C.shadow,
              padding: '20px 22px',
              borderTop: `2px solid ${k.accent ? C.accent : 'transparent'}`,
              cursor: 'pointer', transition: 'all 0.15s',
              position: 'relative',
            }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.accentRim;
                el.style.boxShadow = '0 6px 20px rgba(13,148,136,0.12)';
                el.style.transform = 'translateY(-2px)';
                const arrow = el.querySelector('[data-arrow]') as HTMLElement | null;
                if (arrow) { arrow.style.opacity = '1'; arrow.style.transform = 'translateX(-4px)'; }
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = k.accent ? C.accentRim : C.border;
                el.style.boxShadow = k.accent ? '0 2px 10px rgba(13,148,136,0.08)' : C.shadow;
                el.style.transform = 'translateY(0)';
                const arrow = el.querySelector('[data-arrow]') as HTMLElement | null;
                if (arrow) { arrow.style.opacity = '0'; arrow.style.transform = 'translateX(0)'; }
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <p style={{
                  fontSize: 11, fontWeight: 600, color: C.muted, margin: 0,
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                }}>
                  {k.label}
                </p>
                <span data-arrow style={{
                  fontSize: 14, color: C.accent, opacity: 0,
                  transition: 'all 0.15s', lineHeight: 1,
                }}>
                  ←
                </span>
              </div>
              <p style={{
                fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1,
                color: k.accent ? C.accent : C.text,
              }}>
                {loading ? '—' : k.value}
              </p>
            </Link>
          ))}
        </div>

        {/* ── Upcoming sessions ── */}
        <div style={{ marginBottom: 18 }}>
          <SectionCard title="פגישות קרובות" linkHref="/sessions" linkLabel="הכל ←">
            {loading ? <CardSkeleton /> : data.upcoming.length === 0 ? (
              <p style={{ padding: '18px 24px', fontSize: 13, color: C.muted }}>אין פגישות מתוכננות</p>
            ) : data.upcoming.map((s, i) => (
              <div key={s.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', borderBottom: i < data.upcoming.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: C.accent, display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                    {(s.patient as any)?.full_name ?? '—'}
                  </span>
                </div>
                <DateDisplay
                  date={s.date}
                  size="sm"
                  smartToday
                  muted={C.muted}
                  strong={C.text}
                  style={{ alignItems: 'flex-end', flexShrink: 0 }}
                />
              </div>
            ))}
          </SectionCard>
        </div>

        {/* ── Monthly summaries review ── */}
        <MonthlyReview />

        {/* ── Quick nav ── */}
        <div style={{
          backgroundColor: C.card, borderRadius: 14,
          border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: '20px 24px',
        }}>
          <p style={{
            fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 14px',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            ניווט מהיר
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {shortcuts.map(s => (
              <Link key={s.href} href={s.href} style={{
                display: 'block', padding: '14px 10px', borderRadius: 10,
                border: `1px solid ${C.border}`, backgroundColor: C.card, textAlign: 'center',
                fontSize: 13, fontWeight: 500, color: C.sub, textDecoration: 'none',
                transition: 'all 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
              }}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.backgroundColor = C.accentSub;
                  el.style.borderColor = C.accentRim;
                  el.style.color = C.accent;
                  el.style.boxShadow = '0 4px 12px rgba(13,148,136,0.10)';
                  el.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.backgroundColor = C.card;
                  el.style.borderColor = C.border;
                  el.style.color = C.sub;
                  el.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                  el.style.transform = 'translateY(0)';
                }}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function SectionCard({ title, linkHref, linkLabel, children }: {
  title: string; linkHref: string; linkLabel: string; children: React.ReactNode;
}) {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
    }}>
      <div style={{
        padding: '18px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>{title}</h2>
        <Link href={linkHref} style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 500 }}>
          {linkLabel}
        </Link>
      </div>
      {children}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{ padding: '16px 24px' }}>
      {[80, 60, 72].map((w, i) => (
        <div key={i} style={{
          height: 13, backgroundColor: '#F1F5F9', borderRadius: 6,
          width: `${w}%`, marginBottom: i < 2 ? 12 : 0,
        }} />
      ))}
    </div>
  );
}

/* ── Monthly summaries review ───────────────────────────────────────
 *
 * Source of truth: session_summaries (same table the Excel monthly
 * report pulls from). Read-only — no writes, no schema changes. The
 * "סה״כ שעות חודשיות" tile sums (end_time - start_time) per summary
 * so the user can cross-check the Excel totals at a glance.
 * ─────────────────────────────────────────────────────────────────── */

function MonthlyReview() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows,    setRows]    = useState<MonthlySummaryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { start, end } = monthRange(year, month);
      const { data, error } = await supabase
        .from('session_summaries')
        .select('id, date, start_time, end_time, notes, patient_id, patient:patient_id(full_name)')
        .gte('date', start)
        .lte('date', end)
        .order('date',       { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false });
      if (cancelled) return;
      if (error) {
        console.error('[MonthlyReview]', error.message);
        setRows([]);
        setLoading(false);
        return;
      }
      const enriched: MonthlySummaryRow[] = ((data ?? []) as unknown as MonthlySummaryRow[])
        .map(r => {
          const s = parseTimeToMinutes(r.start_time);
          const e = parseTimeToMinutes(r.end_time);
          const dur = (s != null && e != null && e > s) ? e - s : null;
          return { ...r, durationMin: dur };
        });
      setRows(enriched);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [year, month]);

  // Aggregates derived from rows — no extra queries needed.
  const stats = useMemo(() => {
    let totalMinutes = 0;
    const patientIds = new Set<string>();
    for (const r of rows) {
      if (r.durationMin != null) totalMinutes += r.durationMin;
      if (r.patient_id) patientIds.add(r.patient_id);
    }
    return {
      totalMinutes,
      summaryCount:  rows.length,
      uniquePatients: patientIds.size,
    };
  }, [rows]);

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y - 2, y - 1, y, y + 1];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, boxShadow: C.shadow,
      padding: '22px 24px', marginBottom: 18,
    }}>
      {/* Header: title + month picker */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: 14, marginBottom: 18, flexWrap: 'wrap',
      }}>
        <div>
          <h2 style={{
            fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 2px',
          }}>
            סקירת הדוח החודשי
          </h2>
          <p style={{ fontSize: 11, color: C.muted, margin: 0, letterSpacing: '0.02em' }}>
            מחושב מתוך סיכומי פגישות · אותו מקור של הדוח Excel
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <MiniSelect
            value={String(month)}
            onChange={v => setMonth(+v)}
            options={HEB_MONTHS.map((label, i) => ({ value: String(i + 1), label }))}
            minWidth={120}
          />
          <MiniSelect
            value={String(year)}
            onChange={v => setYear(+v)}
            options={yearOptions.map(y => ({ value: String(y), label: String(y) }))}
            minWidth={86}
          />
        </div>
      </div>

      {/* KPI row — 3 tiles */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18,
      }}>
        <MiniKpi
          label="סה״כ שעות חודשיות"
          value={loading ? '—' : formatHoursDecimal(stats.totalMinutes)}
          suffix={loading ? '' : `(${formatMinutes(stats.totalMinutes)})`}
          accent
        />
        <MiniKpi
          label="סיכומי פגישות"
          value={loading ? '—' : String(stats.summaryCount)}
        />
        <MiniKpi
          label="מטופלות ייחודיות"
          value={loading ? '—' : String(stats.uniquePatients)}
        />
      </div>

      {/* Table */}
      <h3 style={{
        fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 10px',
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        פגישות החודש
      </h3>

      {loading ? (
        <CardSkeleton />
      ) : rows.length === 0 ? (
        <EmptyMonth />
      ) : (
        <div style={{
          border: `1px solid ${C.border}`, borderRadius: 10,
          overflow: 'hidden', backgroundColor: C.card,
        }}>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 13,
            tableLayout: 'fixed', direction: 'rtl',
          }}>
            <colgroup>
              <col style={{ width: '11%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '8%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '38%' }} />
              <col style={{ width: '8%' }} />
            </colgroup>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC' }}>
                <Th>תאריך</Th>
                <Th>משעה</Th>
                <Th>עד שעה</Th>
                <Th>משך</Th>
                <Th>מטופלת</Th>
                <Th>הערות</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id} style={{
                  borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
                }}>
                  <Td>
                    <DateDisplay
                      date={r.date}
                      size="sm"
                      muted={C.muted}
                      strong={C.text}
                      style={{ alignItems: 'flex-start' }}
                    />
                  </Td>
                  <Td>{r.start_time ? r.start_time.slice(0, 5) : '—'}</Td>
                  <Td>{r.end_time   ? r.end_time.slice(0, 5)   : '—'}</Td>
                  <Td>
                    {r.durationMin != null
                      ? <span style={{ fontWeight: 500, color: C.text }}>{formatMinutes(r.durationMin)}</span>
                      : <span style={{ color: C.muted }}>—</span>}
                  </Td>
                  <Td>
                    <span style={{ color: C.text, fontWeight: 500 }}>
                      {r.patient?.full_name ?? '—'}
                    </span>
                  </Td>
                  <Td>
                    <span style={{ color: C.sub, lineHeight: 1.4 }}>
                      {r.notes ? truncate(r.notes, 110) : <span style={{ color: C.muted }}>—</span>}
                    </span>
                  </Td>
                  <Td align="center">
                    {r.patient_id ? (
                      <Link
                        href={`/patients/${r.patient_id}`}
                        style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: 7,
                          fontSize: 12, fontWeight: 500,
                          backgroundColor: C.accentSub, color: C.accent,
                          border: `1px solid ${C.accentRim}`, textDecoration: 'none',
                        }}
                      >
                        פתח
                      </Link>
                    ) : (
                      <span style={{ fontSize: 12, color: C.muted }}>—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ label, value, suffix, accent }: {
  label: string; value: string; suffix?: string; accent?: boolean;
}) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 10,
      border: `1px solid ${accent ? C.accentRim : C.border}`,
      backgroundColor: accent ? C.accentSub : '#FAFBFD',
    }}>
      <p style={{
        fontSize: 10.5, fontWeight: 600, color: C.muted, margin: '0 0 6px',
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 22, fontWeight: 700, margin: 0, lineHeight: 1.1,
        color: accent ? C.accent : C.text,
      }}>
        {value}
        {suffix && (
          <span style={{ fontSize: 12, fontWeight: 500, color: C.muted, marginInlineStart: 6 }}>
            {suffix}
          </span>
        )}
      </p>
    </div>
  );
}

function MiniSelect({
  value, onChange, options, minWidth,
}: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        minWidth: minWidth ?? 100,
        padding: '7px 11px', borderRadius: 8,
        border: `1px solid ${C.border}`, backgroundColor: C.card,
        fontSize: 13, color: C.text, fontFamily: 'inherit',
        cursor: 'pointer', outline: 'none',
      }}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      padding: '10px 12px', textAlign: 'right',
      fontSize: 11, fontWeight: 600, color: C.muted,
      textTransform: 'uppercase', letterSpacing: '0.06em',
      borderBottom: `1px solid ${C.border}`,
    }}>
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'center' | 'right' }) {
  return (
    <td style={{
      padding: '11px 12px', verticalAlign: 'middle',
      textAlign: align ?? 'right',
      fontSize: 13, color: C.text,
      overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </td>
  );
}

function EmptyMonth() {
  return (
    <div style={{
      padding: '28px 16px', textAlign: 'center',
      backgroundColor: '#FAFBFD', borderRadius: 10, border: `1px dashed ${C.border}`,
      color: C.muted, fontSize: 13,
    }}>
      אין סיכומי פגישות לחודש זה
    </div>
  );
}

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}
