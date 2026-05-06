'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navLinks = [
  { href: '/',                   label: 'דשבורד' },
  { href: '/patients',           label: 'מטופלות' },
  { href: '/staff',              label: 'צוות' },
  { href: '/sessions',           label: 'פגישות' },
  { href: '/summaries',          label: 'סיכומי פגישות' },
  { href: '/recordings',         label: 'הקלטות' },
  { href: '/quarterly',          label: 'סיכום רבעון' },
  { href: '/payments',           label: 'תשלומי שיראל' },
  { href: '/expenses',           label: 'הוצאות פרטיות' },
  { href: '/petty-cash',         label: 'מעשר געלט' },
  { href: '/settings/users',     label: 'הגדרות' },
];

export default function Navbar() {
  const pathname = usePathname();

  return (
    <nav
      className="sticky top-0 z-50 border-b"
      style={{
        backgroundColor: '#ffffff',
        borderBottomColor: '#e5ddd4',
        boxShadow: '0 1px 6px 0 rgba(26,38,32,0.07)',
      }}
    >
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="flex items-center justify-between h-[60px]">

          {/* Brand */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#1f623e' }}
            >
              מ
            </div>
            <span
              className="font-bold text-base tracking-tight"
              style={{ color: '#1a2620' }}
            >
              מחר אחר
              <span className="font-normal text-sm mr-1" style={{ color: '#6b7b6e' }}>
                – שדה חמד
              </span>
            </span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-0.5 overflow-x-auto">
            {navLinks.map((link) => {
              const isActive =
                link.href === '/'
                  ? pathname === '/'
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150"
                  style={
                    isActive
                      ? {
                          backgroundColor: '#eef6f1',
                          color: '#1f623e',
                          fontWeight: 600,
                        }
                      : {
                          color: '#4a5e52',
                        }
                  }
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = '#f6f2ec';
                      e.currentTarget.style.color = '#1a2620';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = '';
                      e.currentTarget.style.color = '#4a5e52';
                    }
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active page accent line */}
      <div
        className="h-px w-full"
        style={{ background: 'linear-gradient(90deg, transparent, #c49438 30%, #c49438 70%, transparent)' }}
      />
    </nav>
  );
}
