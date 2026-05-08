'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { formatGregorian, hebrewLong, PRESETS } from '@/lib/dateUtils';
import DateDisplay from '@/components/ui/DateDisplay';

interface UpcomingSession {
  id: string;
  date: string;
  patient: { full_name: string } | null;
}

interface PendingRec {
  id: string;
  recorded_at: string;
  patient: { full_name: string } | null;
}

interface DashData {
  todaySessions:     number;
  activePatients:    number;
  weekSessions:      number;
  pendingRecordings: number;
  upcoming:          UpcomingSession[];
  recs:              PendingRec[];
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
  { href: '/recordings', label: 'הקלטות'    },
  { href: '/quarterly',  label: 'רבעוני'    },
  { href: '/staff',      label: 'צוות'      },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashData>({
    todaySessions: 0, activePatients: 0, weekSessions: 0,
    pendingRecordings: 0, upcoming: [], recs: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const sun   = new Date(); sun.setDate(sun.getDate() - sun.getDay());
      const sat   = new Date(sun); sat.setDate(sun.getDate() + 6);
      const fmt   = (d: Date) => d.toISOString().slice(0, 10);

      const [pts, todaySess, weekSess, recCount, upcoming, recs] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'planned'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('date', fmt(sun)).lte('date', fmt(sat)).eq('status', 'planned'),
        supabase.from('recordings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('sessions').select('id, date, patient:patient_id(full_name)').gte('date', today).eq('status', 'planned').order('date').limit(6),
        supabase.from('recordings').select('id, recorded_at, patient:patient_id(full_name)').eq('status', 'pending').order('recorded_at', { ascending: false }).limit(5),
      ]);

      setData({
        todaySessions:     todaySess.count  ?? 0,
        activePatients:    pts.count        ?? 0,
        weekSessions:      weekSess.count   ?? 0,
        pendingRecordings: recCount.count   ?? 0,
        upcoming:          (upcoming.data   ?? []) as unknown as UpcomingSession[],
        recs:              (recs.data       ?? []) as unknown as PendingRec[],
      });
      setLoading(false);
    }
    load();
  }, []);

  const kpis = [
    { label: 'פגישות היום',    value: data.todaySessions,     accent: true,  href: '/sessions?filter=today'   },
    { label: 'מטופלות פעילות', value: data.activePatients,    accent: false, href: '/patients?status=active'  },
    { label: 'פגישות השבוע',   value: data.weekSessions,      accent: false, href: '/sessions?filter=week'    },
    { label: 'הקלטות ממתינות', value: data.pendingRecordings, accent: false, href: '/recordings?status=pending' },
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
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

        {/* ── Two-column ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>

          {/* Upcoming sessions */}
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
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  backgroundColor: C.bg,
                  padding: '4px 11px', borderRadius: 20, border: `1px solid ${C.border}`,
                }}>
                  <DateDisplay date={s.date} variant="line" size="sm" smartToday muted={C.sub} strong={C.text} />
                </span>
              </div>
            ))}
          </SectionCard>

          {/* Pending recordings */}
          <SectionCard title="הקלטות ממתינות לתמלול" linkHref="/recordings" linkLabel="הכל ←">
            {loading ? <CardSkeleton /> : data.recs.length === 0 ? (
              <div style={{ padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ fontSize: 15, color: C.accent }}>✓</span>
                <span style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>אין הקלטות ממתינות</span>
              </div>
            ) : data.recs.map((r, i) => (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 24px', borderBottom: i < data.recs.length - 1 ? `1px solid ${C.border}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#F59E0B', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                    {(r.patient as any)?.full_name ?? '—'}
                  </span>
                </div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  backgroundColor: C.bg,
                  padding: '4px 11px', borderRadius: 20, border: `1px solid ${C.border}`,
                }}>
                  <DateDisplay date={r.recorded_at} variant="line" size="sm" withTime muted={C.sub} strong={C.text} />
                </span>
              </div>
            ))}
          </SectionCard>
        </div>

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
