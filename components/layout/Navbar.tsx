'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/',           label: 'דשבורד' },
  { href: '/patients',   label: 'מטופלות' },
  { href: '/staff',      label: 'צוות' },
  { href: '/sessions',   label: 'פגישות' },
  { href: '/summaries',  label: 'סיכומי פגישות' },
  { href: '/recordings', label: 'הקלטות' },
  { href: '/quarterly',  label: 'סיכום רבעון' },
  { href: '/payments',   label: 'תשלומי שיראל' },
  { href: '/expenses',   label: 'הוצאות פרטיות' },
  { href: '/petty-cash', label: 'מעשר געלט' },
];

export default function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <span className="text-teal-700 font-bold text-lg tracking-tight whitespace-nowrap">
            מחר אחר – שדה חמד
          </span>
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {navLinks.map((link) => {
              const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                  }`}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
