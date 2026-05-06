'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import StatCard from '@/components/ui/StatCard';

interface DashboardStats {
  activePatients: number;
  todaySessions: number;
  weekSessions: number;
  pendingRecordings: number;
  unpaidPayments: number;
}

function getWeekRange() {
  const today = new Date();
  const day   = today.getDay();
  const sun   = new Date(today); sun.setDate(today.getDate() - day);
  const sat   = new Date(sun);  sat.setDate(sun.getDate() + 6);
  const fmt   = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(sun), end: fmt(sat) };
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

const quickActions = [
  { href: '/patients',   label: 'הוספת מטופלת',  desc: 'רישום מטופלת חדשה' },
  { href: '/sessions',   label: 'הוספת פגישה',   desc: 'קביעת פגישה חדשה' },
  { href: '/summaries',  label: 'סיכום פגישה',   desc: 'תיעוד מפגש' },
  { href: '/recordings', label: 'הקלטה חדשה',    desc: 'הוספת הקלטה' },
  { href: '/expenses',   label: 'הוצאה חדשה',    desc: 'רישום הוצאה' },
];

const modules = [
  { href: '/patients',   label: 'מטופלות',         desc: 'ניהול רשימת המטופלות' },
  { href: '/staff',      label: 'אנשי צוות',        desc: 'רכזות, מדריכות ומטפלות' },
  { href: '/sessions',   label: 'יומן פגישות',      desc: 'תיאום ומעקב פגישות' },
  { href: '/summaries',  label: 'סיכומי פגישות',    desc: 'תיעוד מפגשים' },
  { href: '/recordings', label: 'הקלטות ותמלולים',  desc: 'ניהול הקלטות קוליות' },
  { href: '/quarterly',  label: 'סיכום רבעון',      desc: 'סקירות תקופתיות' },
  { href: '/payments',   label: 'תשלומי שיראל',     desc: 'מעקב תשלומים חודשיים' },
  { href: '/expenses',   label: 'הוצאות פרטיות',    desc: 'הוצאות לפי מטופלת' },
  { href: '/petty-cash', label: 'מעשר געלט',        desc: 'הוצאות קטנות שוטפות' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    activePatients: 0, todaySessions: 0, weekSessions: 0,
    pendingRecordings: 0, unpaidPayments: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const { start, end } = getWeekRange();

      const [patients, todaySess, weekSess, recordings, payments] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'planned'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('date', start).lte('date', end).eq('status', 'planned'),
        supabase.from('recordings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('is_paid', false),
      ]);

      setStats({
        activePatients:    patients.count   ?? 0,
        todaySessions:     todaySess.count  ?? 0,
        weekSessions:      weekSess.count   ?? 0,
        pendingRecordings: recordings.count ?? 0,
        unpaidPayments:    payments.count   ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const statCards = [
    { title: 'מטופלות פעילות',  value: loading ? '—' : stats.activePatients,    description: 'סה"כ מטופלות פעילות',    accent: true },
    { title: 'פגישות היום',      value: loading ? '—' : stats.todaySessions,     description: 'מתוכננות להיום' },
    { title: 'פגישות השבוע',     value: loading ? '—' : stats.weekSessions,      description: 'מתוכננות לשבוע זה' },
    { title: 'הקלטות ממתינות',   value: loading ? '—' : stats.pendingRecordings, description: 'ממתינות לתמלול' },
    { title: 'תשלומים פתוחים',   value: loading ? '—' : stats.unpaidPayments,    description: 'חודשים שטרם שולמו' },
  ];

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '32px 24px' }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: 32 }}>
        <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 4px' }}>
          {getGreeting()} · {formatDate()}
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#0F172A', margin: 0 }}>
          מחר אחר – שדה חמד
        </h1>
        <p style={{ fontSize: 14, color: '#64748B', margin: '4px 0 0' }}>
          מערכת ניהול טיפולית · מבט כולל על מצב המערכת
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: 16,
          marginBottom: 28,
        }}
      >
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          padding: '20px 22px',
          marginBottom: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#0F766E' }} />
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>פעולות מהירות</h2>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              style={{
                display: 'block',
                borderRadius: 10,
                padding: '14px 12px',
                textAlign: 'center',
                backgroundColor: '#F8FAFC',
                border: '1px solid #E2E8F0',
                textDecoration: 'none',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F0FDFA';
                e.currentTarget.style.borderColor = '#99F6E4';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,118,110,0.10)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#F8FAFC';
                e.currentTarget.style.borderColor = '#E2E8F0';
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <p style={{ fontSize: 13, fontWeight: 600, margin: '0 0 2px', color: '#0F766E' }}>
                {action.label}
              </p>
              <p style={{ fontSize: 11, color: '#94A3B8', margin: 0 }}>{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Module grid ── */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 12,
          border: '1px solid #E2E8F0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          padding: '20px 22px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: '#0F766E' }} />
          <h2 style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', margin: 0 }}>מודולים</h2>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap: 10,
          }}
        >
          {modules.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid #E2E8F0',
                textDecoration: 'none',
                transition: 'all 0.12s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#F0FDFA';
                e.currentTarget.style.borderColor = '#99F6E4';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.borderColor = '#E2E8F0';
              }}
            >
              <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 2px', color: '#0F172A' }}>
                {mod.label}
              </p>
              <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>{mod.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
