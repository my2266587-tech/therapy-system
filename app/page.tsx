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
  { href: '/patients',   label: 'מטופלות',            desc: 'ניהול רשימת המטופלות' },
  { href: '/staff',      label: 'אנשי צוות',           desc: 'רכזות, מדריכות ומטפלות' },
  { href: '/sessions',   label: 'יומן פגישות',         desc: 'תיאום ומעקב פגישות' },
  { href: '/summaries',  label: 'סיכומי פגישות',       desc: 'תיעוד מפגשים' },
  { href: '/recordings', label: 'הקלטות ותמלולים',     desc: 'ניהול הקלטות קוליות' },
  { href: '/quarterly',  label: 'סיכום רבעון',         desc: 'סקירות תקופתיות' },
  { href: '/payments',   label: 'תשלומי שיראל',        desc: 'מעקב תשלומים חודשיים' },
  { href: '/expenses',   label: 'הוצאות פרטיות',       desc: 'הוצאות לפי מטופלת' },
  { href: '/petty-cash', label: 'מעשר געלט',           desc: 'הוצאות קטנות שוטפות' },
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
    <div className="max-w-screen-xl mx-auto px-6 py-8">

      {/* ── Hero header ── */}
      <div
        className="rounded-2xl p-7 mb-8 overflow-hidden relative"
        style={{
          background: 'linear-gradient(135deg, #1f623e 0%, #2d7a52 60%, #3d9068 100%)',
          boxShadow: '0 4px 20px rgba(31,98,62,0.25)',
        }}
      >
        <div className="relative z-10">
          <p className="text-sm font-medium mb-1" style={{ color: '#a9d5ba' }}>
            {getGreeting()} · {formatDate()}
          </p>
          <h1 className="text-2xl font-bold text-white mb-1">מחר אחר – שדה חמד</h1>
          <p className="text-sm" style={{ color: '#c4e8d4' }}>
            מערכת ניהול טיפולית · מבט כולל על מצב המערכת
          </p>
        </div>
        {/* Decorative circle */}
        <div
          className="absolute -left-8 -top-8 w-40 h-40 rounded-full opacity-10"
          style={{ backgroundColor: '#ffffff' }}
        />
        <div
          className="absolute left-24 -bottom-10 w-28 h-28 rounded-full opacity-10"
          style={{ backgroundColor: '#c49438' }}
        />
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div
        className="bg-white rounded-xl p-6 mb-6"
        style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px rgba(26,38,32,0.06)' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-0.5 h-5 rounded-full" style={{ backgroundColor: '#c49438' }} />
          <h2 className="text-sm font-bold" style={{ color: '#1a2620' }}>פעולות מהירות</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="block rounded-xl p-4 text-center transition-all duration-150 group"
              style={{ backgroundColor: '#faf7f2', border: '1px solid #e5ddd4' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#eef6f1';
                e.currentTarget.style.borderColor = '#a9d5ba';
                e.currentTarget.style.transform = 'translateY(-1px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(31,98,62,0.12)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#faf7f2';
                e.currentTarget.style.borderColor = '#e5ddd4';
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = '';
              }}
            >
              <p className="text-sm font-semibold mb-0.5" style={{ color: '#1f623e' }}>
                {action.label}
              </p>
              <p className="text-xs" style={{ color: '#8fa49a' }}>{action.desc}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Module grid ── */}
      <div
        className="bg-white rounded-xl p-6"
        style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px rgba(26,38,32,0.06)' }}
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-0.5 h-5 rounded-full" style={{ backgroundColor: '#c49438' }} />
          <h2 className="text-sm font-bold" style={{ color: '#1a2620' }}>מודולים</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {modules.map((mod) => (
            <Link
              key={mod.href}
              href={mod.href}
              className="block p-4 rounded-xl transition-all duration-150"
              style={{ border: '1px solid #e5ddd4' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#eef6f1';
                e.currentTarget.style.borderColor = '#a9d5ba';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '';
                e.currentTarget.style.borderColor = '#e5ddd4';
              }}
            >
              <p className="font-semibold text-sm mb-0.5" style={{ color: '#1a2620' }}>
                {mod.label}
              </p>
              <p className="text-xs" style={{ color: '#8fa49a' }}>{mod.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
