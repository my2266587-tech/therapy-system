'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import StatCard from '@/components/ui/StatCard';

interface DashboardStats {
  activePatients: number;
  todaySessions: number;
  weekSessions: number;
  pendingRecordings: number;
  unpaidPayments: number;
  sessionsNeedingSummary: number;
}

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const sun = new Date(today); sun.setDate(today.getDate() - day);
  const sat = new Date(sun);  sat.setDate(sun.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(sun), end: fmt(sat) };
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'בוקר טוב';
  if (h < 17) return 'צהריים טובים';
  return 'ערב טוב';
}

const TODAY_HE = new Date().toLocaleDateString('he-IL', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const quickActions = [
  { href: '/patients',   label: '+ מטופלת חדשה',   style: 'bg-teal-700 hover:bg-teal-800 text-white' },
  { href: '/sessions',   label: '+ פגישה חדשה',     style: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' },
  { href: '/summaries',  label: '+ סיכום חדש',      style: 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50' },
  { href: '/recordings', label: '🎙️ הקלטה חדשה',   style: 'bg-white border border-red-200 text-red-600 hover:bg-red-50' },
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    activePatients: 0, todaySessions: 0, weekSessions: 0,
    pendingRecordings: 0, unpaidPayments: 0, sessionsNeedingSummary: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    async function load() {
      const today = new Date().toISOString().slice(0, 10);
      const { start, end } = getWeekRange();
      const [patients, todaySess, weekSess, recordings, payments, needingSummary] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'planned'),
        supabase.from('sessions').select('id', { count: 'exact', head: true }).gte('date', start).lte('date', end).eq('status', 'planned'),
        supabase.from('recordings').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('payments').select('id', { count: 'exact', head: true }).eq('is_paid', false),
        // Past sessions still in 'planned' state = no summary was written
        supabase.from('sessions').select('id', { count: 'exact', head: true }).lt('date', today).eq('status', 'planned'),
      ]);
      setStats({
        activePatients:         patients.count      ?? 0,
        todaySessions:          todaySess.count     ?? 0,
        weekSessions:           weekSess.count      ?? 0,
        pendingRecordings:      recordings.count    ?? 0,
        unpaidPayments:         payments.count      ?? 0,
        sessionsNeedingSummary: needingSummary.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, []);

  const v = (n: number) => loading ? '—' : n;

  return (
    <div className="max-w-screen-lg mx-auto px-8 py-10 space-y-8">

      {/* ── Greeting ──────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{greeting()}</h1>
        <p className="text-slate-400 text-sm mt-1">{TODAY_HE}</p>
      </div>

      {/* ── Quick actions ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2.5">
        {quickActions.map(a => (
          <Link key={a.href} href={a.href}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm ${a.style}`}>
            {a.label}
          </Link>
        ))}
      </div>

      {/* ── Stat cards ────────────────────────────────────────── */}
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">סקירה כללית</h2>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="מטופלות פעילות"  value={v(stats.activePatients)}    accent="teal"   description="מטופלות פעילות כרגע" />
          <StatCard title="פגישות היום"      value={v(stats.todaySessions)}     accent="blue"   description="מתוכננות להיום" />
          <StatCard title="פגישות השבוע"     value={v(stats.weekSessions)}      accent="blue"   description="מתוכננות לשבוע זה" />
        </div>
      </div>

      {/* ── Attention needed ──────────────────────────────────── */}
      {(!loading && (stats.sessionsNeedingSummary > 0 || stats.pendingRecordings > 0 || stats.unpaidPayments > 0)) && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">דורש טיפול</h2>
          <div className="space-y-3">
            {stats.sessionsNeedingSummary > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-orange-800">פגישות ללא סיכום</p>
                  <p className="text-xs text-orange-600 mt-0.5">{stats.sessionsNeedingSummary} פגישות עברו ועדיין ממתינות לסיכום</p>
                </div>
                <Link href="/sessions"
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                  לסיכום פגישות
                </Link>
              </div>
            )}
            {stats.pendingRecordings > 0 && (
              <div className="bg-violet-50 border border-violet-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-violet-800">הקלטות ממתינות לתמלול</p>
                  <p className="text-xs text-violet-600 mt-0.5">{stats.pendingRecordings} הקלטות ממתינות לעיבוד</p>
                </div>
                <Link href="/recordings"
                  className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                  להקלטות
                </Link>
              </div>
            )}
            {stats.unpaidPayments > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-800">תשלומים שטרם שולמו</p>
                  <p className="text-xs text-amber-600 mt-0.5">{stats.unpaidPayments} חודשים פתוחים</p>
                </div>
                <Link href="/payments"
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap">
                  לתשלומים
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
