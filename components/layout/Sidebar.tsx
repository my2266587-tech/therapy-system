'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type NavItem  = { href: string; label: string; icon: string };
type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'ניהול',
    items: [
      { href: '/',         label: 'דשבורד',   icon: '⊞' },
      { href: '/patients', label: 'מטופלות',   icon: '♡' },
    ],
  },
  {
    label: 'פגישות וסיכומים',
    items: [
      { href: '/sessions',   label: 'פגישות',        icon: '◷' },
      { href: '/summaries',  label: 'סיכומי פגישות',  icon: '☰' },
      { href: '/recordings', label: 'הקלטות',         icon: '◉' },
      { href: '/quarterly',  label: 'סיכום רבעון',    icon: '▦' },
    ],
  },
  {
    label: 'צוות',
    items: [
      { href: '/staff', label: 'אנשי צוות', icon: '✦' },
    ],
  },
  {
    label: 'כספים',
    items: [
      { href: '/payments',   label: 'תשלומי שיראל',   icon: '◈' },
      { href: '/expenses',   label: 'הוצאות פרטיות',  icon: '◐' },
      { href: '/petty-cash', label: 'מעשר געלט',      icon: '◎' },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [userEmail,    setUserEmail]    = useState<string | null>(null);
  const [loggingOut,   setLoggingOut]   = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
    });
  }, []);

  function isActive(href: string) {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.push('/login');
  }

  return (
    <aside className="w-56 shrink-0 bg-white border-l border-slate-200 flex flex-col h-full">
      {/* ── Logo ─────────────────────────────────────────── */}
      <div className="bg-teal-700 px-5 py-5 shrink-0">
        <p className="text-white font-bold text-base leading-tight tracking-tight">מחר אחר</p>
        <p className="text-teal-200 text-xs mt-0.5">שדה חמד</p>
      </div>

      {/* ── Navigation ────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {NAV_GROUPS.map(group => (
          <div key={group.label}>
            <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                      active
                        ? 'bg-teal-50 text-teal-700'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-7 h-7 rounded-lg text-sm transition-colors ${
                        active
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200 group-hover:text-slate-600'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="flex-1">{item.label}</span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-teal-600 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── User + Logout ─────────────────────────────── */}
      <div className="shrink-0 border-t border-slate-100 p-3 space-y-2">
        {userEmail && (
          <p className="text-[11px] text-slate-400 px-1 truncate" title={userEmail}>
            {userEmail}
          </p>
        )}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
        >
          <span className="text-base leading-none">⇥</span>
          {loggingOut ? 'יוצאת...' : 'יציאה'}
        </button>
      </div>
    </aside>
  );
}
