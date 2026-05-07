'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface Session {
  id: string;
  date: string;
  patient: { full_name: string } | null;
}

interface Payment {
  id: string;
  month: string;
  patient: { full_name: string } | null;
}

interface DashboardData {
  todaySessions:     number;
  activePatients:    number;
  weekSessions:      number;
  unpaidPayments:    number;
  pendingRecordings: number;
  upcomingSessions:  Session[];
  recentUnpaid:      Payment[];
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

function formatDate() {
  return new Date().toLocaleDateString('he-IL', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatSessionDate(dateStr: string) {
  const today    = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomStr   = tomorrow.toISOString().slice(0, 10);
  if (dateStr === today)  return 'היום';
  if (dateStr === tomStr) return 'מחר';
  return new Date(dateStr).toLocaleDateString('he-IL', { weekday: 'short', month: 'short', day: 'numeric' });
}

const C = {
  bg:        '#F6F8FB',
  card:      '#FFFFFF',
  border:    '#E8ECF0',
  accent:    '#0D9488',
  accentSub: '#F0FDF9',
  accentRim: '#99F6E4',
  text:      '#1A2332',
  sub:       '#64748B',
  muted:     '#94A3B8',
  shadow:    '0 1px 4px rgba(0,0,0,0.05)',
  shadowMd:  '0 2px 10px rgba(0,0,0,0.06)',
};

const shortcuts = [
  { href: '/patients',   label: 'מטופלות'    },
  { href: '/sessions',   label: 'פגישות'     },
  { href: '/summaries',  label: 'סיכומים'    },
  { href: '/payments',   label: 'תשלומים'    },
  { href: '/expenses',   label: 'הוצאות'     },
  { href: '/recordings', label: 'הקלטות'     },
];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData>({
    todaySessions: 0, activePatients: 0, weekSessions: 0,
    unpaidPayments: 0, pendingRecordings: 0,
    upcomingSessions: [], recentUnpaid: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const sun   = new Date(); sun.setDate(sun.getDate() - sun.getDay());
      const sat   = new Date(sun); sat.setDate(sun.getDate() + 6);
      const fmt   = (d: Date) => d.toISOString().slice(0, 10);

      const [pts, todaySess, weekSess, recs, pays, upcoming, unpaid] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'planned'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('date', fmt(sun)).lte('date', fmt(sat)).eq('status', 'planned'),
        supabase.from('recordings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('is_paid', false),
        supabase.from('sessions').select('id, date, patient:patient_id(full_name)').gte('date', today).eq('status', 'planned').order('date').limit(6),
        supabase.from('payments').select('id, month, patient:patient_id(full_name)').eq('is_paid', false).order('month', { ascending: false }).limit(5),
      ]);

      setData({
        todaySessions:     todaySess.count ?? 0,
        activePatients:    pts.count       ?? 0,
        weekSessions:      weekSess.count  ?? 0,
        unpaidPayments:    pays.count      ?? 0,
        pendingRecordings: recs.count      ?? 0,
        upcomingSessions:  (upcoming.data  ?? []) as unknown as Session[],
        recentUnpaid:      (unpaid.data    ?? []) as unknown as Payment[],
      });
      setLoading(false);
    }
    load();
  }, []);

  const kpis = [
    { label: 'פגישות היום',    value: data.todaySessions,  accent: true  },
    { label: 'מטופלות פעילות', value: data.activePatients, accent: false },
    { label: 'פגישות השבוע',   value: data.weekSessions,   accent: false },
    { label: 'תשלומים פתוחים', value: data.unpaidPayments, accent: false },
  ];

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px 36px', direction: 'rtl' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 13, color: C.muted, margin: '0 0 8px', fontWeight: 400 }}>
            {getGreeting()} · {formatDate()}
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: C.text, margin: 0, letterSpacing: '-0.4px' }}>
            מחר אחר – שדה חמד
          </h1>
        </div>

        {/* ── KPI row ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {kpis.map(k => (
            <div
              key={k.label}
              style={{
                backgroundColor: C.card,
                borderRadius: 14,
                border: `1px solid ${k.accent ? C.accentRim : C.border}`,
                boxShadow: k.accent ? `0 2px 10px rgba(13,148,136,0.08)` : C.shadow,
                padding: '20px 22px',
                borderTop: `2px solid ${k.accent ? C.accent : 'transparent'}`,
              }}
            >
              <p style={{
                fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 10px',
                textTransform: 'uppercase', letterSpacing: '0.07em',
              }}>
                {k.label}
              </p>
              <p style={{
                fontSize: 36, fontWeight: 700, margin: 0, lineHeight: 1,
                color: k.accent ? C.accent : C.text,
              }}>
                {loading ? '—' : k.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>

          {/* Right — Upcoming sessions */}
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 26px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>פגישות קרובות</h2>
              <Link href="/sessions" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 500 }}>
                הכל ←
              </Link>
            </div>
            <div>
              {loading ? (
                <Skeleton />
              ) : data.upcomingSessions.length === 0 ? (
                <Empty text="אין פגישות מתוכננות" />
              ) : (
                data.upcomingSessions.map((s, i) => (
                  <div
                    key={s.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 26px',
                      borderBottom: i < data.upcomingSessions.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: C.accent, flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                        {(s.patient as any)?.full_name ?? '—'}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, color: C.sub, backgroundColor: C.bg,
                      padding: '3px 12px', borderRadius: 20, border: `1px solid ${C.border}`,
                    }}>
                      {formatSessionDate(s.date)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Left — Unpaid payments */}
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
          }}>
            <div style={{
              padding: '20px 26px', borderBottom: `1px solid ${C.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>תשלומים פתוחים</h2>
              <Link href="/payments" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 500 }}>
                הכל ←
              </Link>
            </div>
            <div>
              {loading ? (
                <Skeleton />
              ) : data.recentUnpaid.length === 0 ? (
                <AllClear />
              ) : (
                data.recentUnpaid.map((p, i) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '13px 26px',
                      borderBottom: i < data.recentUnpaid.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#F59E0B', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>
                        {(p.patient as any)?.full_name ?? '—'}
                      </span>
                    </div>
                    <span style={{
                      fontSize: 12, color: '#92400E', backgroundColor: '#FFFBEB',
                      padding: '3px 12px', borderRadius: 20, border: '1px solid #FDE68A',
                    }}>
                      {p.month}
                    </span>
                  </div>
                ))
              )}
            </div>
            {!loading && data.unpaidPayments > 5 && (
              <div style={{
                padding: '10px 26px', borderTop: `1px solid ${C.border}`,
                backgroundColor: '#FFFBEB',
              }}>
                <span style={{ fontSize: 12, color: '#92400E' }}>
                  + {data.unpaidPayments - 5} נוספים ממתינים לתשלום
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Pending recordings alert (only when relevant) ── */}
        {!loading && data.pendingRecordings > 0 && (
          <div style={{
            backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
            borderRadius: 12, padding: '14px 22px', marginBottom: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: C.accent }} />
              <span style={{ fontSize: 14, color: '#0F766E', fontWeight: 500 }}>
                {data.pendingRecordings} הקלטות ממתינות לתמלול
              </span>
            </div>
            <Link href="/recordings" style={{ fontSize: 12, color: C.accent, textDecoration: 'none', fontWeight: 600 }}>
              לטיפול ←
            </Link>
          </div>
        )}

        {/* ── Quick nav ── */}
        <div style={{
          backgroundColor: C.card, borderRadius: 16,
          border: `1px solid ${C.border}`, boxShadow: C.shadow, padding: '22px 26px',
        }}>
          <p style={{
            fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 16px',
            textTransform: 'uppercase', letterSpacing: '0.08em',
          }}>
            ניווט מהיר
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10 }}>
            {shortcuts.map(s => (
              <ShortcutLink key={s.href} href={s.href} label={s.label} />
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

function ShortcutLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        display: 'block', padding: '13px 8px', borderRadius: 10,
        border: `1px solid ${C.border}`, textAlign: 'center',
        fontSize: 13, fontWeight: 500, color: C.sub,
        textDecoration: 'none', transition: 'all 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.backgroundColor = C.accentSub;
        e.currentTarget.style.borderColor     = C.accentRim;
        e.currentTarget.style.color           = C.accent;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.backgroundColor = '';
        e.currentTarget.style.borderColor     = C.border;
        e.currentTarget.style.color           = C.sub;
      }}
    >
      {label}
    </Link>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: '16px 26px' }}>
      {[80, 60, 72].map((w, i) => (
        <div key={i} style={{
          height: 13, borderRadius: 6, backgroundColor: '#F1F5F9',
          marginBottom: i < 2 ? 12 : 0, width: `${w}%`,
        }} />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ padding: '24px 26px', color: C.muted, fontSize: 13 }}>
      {text}
    </div>
  );
}

function AllClear() {
  return (
    <div style={{ padding: '24px 26px', display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 15, color: C.accent }}>✓</span>
      <p style={{ fontSize: 13, color: C.sub, margin: 0, fontWeight: 500 }}>כל התשלומים עדכניים</p>
    </div>
  );
}
