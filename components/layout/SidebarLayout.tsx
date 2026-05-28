'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Logo from '@/components/ui/Logo';
import AssistantDrawer from '@/components/ui/AssistantDrawer';

/* ── Icon paths (24×24 viewBox, stroke) ── */
const iconPaths: Record<string, string> = {
  dashboard:   'M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z',
  patients:    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  staff:       'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  sessions:    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z',
  calendar:    'M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 14h2v2H8zm6 0h2v2h-2z',
  summaries:   'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zm-4 13H8m4-4H8m6-6v6h6',
  quarterly:   'M3 3v18h18M18 17V9m-5 8V5m-5 12v-3',
  payments:    'M2 5h20v14H2V5zm0 5h20',
  expenses:    'M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9h6m-6 4h3',
  'petty-cash':'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm1 5v2m0 4v2m-4-8h5.5a2.5 2.5 0 0 1 0 5H9m4 0h1.5a2.5 2.5 0 0 1 0 5H9',
  reports:     'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h8M8 9h2',
  import:      'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  settings:    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm4.95-1.95 1.41 1.41-1.06 1.06-1.41-1.41M17 12h2m-2.05 2.95-1.41 1.41-1.06-1.06 1.41-1.41M15 19l-1-1.73M12 20v-2m-3 1-1-1.73M7.05 16.95l1.41-1.41 1.06 1.06-1.41 1.41M5 12H3m2.05-2.95 1.41 1.41L8.52 9.4 7.1 8M9 5l1 1.73M12 4v2m3-1 1 1.73',
  chevronLeft: 'M15 18l-6-6 6-6',
  chevronRight:'M9 18l6-6-6-6',
  menu:        'M3 12h18M3 6h18M3 18h18',
  x:           'M18 6L6 18M6 6l12 12',
};

function Icon({ name, size = 18, style }: { name: string; size?: number; style?: React.CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={style}
    >
      <path d={iconPaths[name] ?? ''} />
    </svg>
  );
}

const navItems = [
  { href: '/',               label: 'דשבורד',          icon: 'dashboard'   },
  { href: '/patients',       label: 'מטופלות',          icon: 'patients'    },
  { href: '/staff',          label: 'צוות',             icon: 'staff'       },
  { href: '/sessions',       label: 'פגישות',           icon: 'sessions'    },
  { href: '/calendar',       label: 'לוח שנה',          icon: 'calendar'    },
  { href: '/summaries',      label: 'סיכומי פגישות',    icon: 'summaries'   },
  { href: '/quarterly',      label: 'סיכום רבעון',      icon: 'quarterly'   },
  { href: '/payments',       label: 'תשלומי שיראל',     icon: 'payments'    },
  { href: '/expenses',       label: 'הוצאות פרטיות',    icon: 'expenses'    },
  { href: '/petty-cash',     label: 'מעשר געלט',        icon: 'petty-cash'  },
  { href: '/reports/monthly', label: 'דוחות חודשיים',   icon: 'reports'     },
  { href: '/import',         label: 'ייבוא נתונים',     icon: 'import'      },
  { href: '/settings/users', label: 'הגדרות',           icon: 'settings'    },
];

/* ── Colour constants (sidebar is dark) ── */
const SB = {
  bg:           '#0F172A',
  itemText:     'rgba(255,255,255,0.55)',
  itemHover:    'rgba(255,255,255,0.05)',
  activeText:   '#FFFFFF',
  activeBg:     'rgba(255,255,255,0.10)',
  activeBorder: '#0D9488',
  brand:        '#FFFFFF',
  brandSub:     'rgba(255,255,255,0.40)',
  divider:      'rgba(255,255,255,0.07)',
  logoMark:     '#0D9488',
};

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname     = usePathname();
  const [collapsed,  setCollapsed]  = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Close mobile panel when route changes */
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  /* Hide sidebar on auth pages */
  const noSidebar = pathname === '/login' || pathname?.startsWith('/auth/');
  if (noSidebar) return <>{children}</>;

  function isActive(href: string) {
    if (href === '/') return pathname === '/';
    return pathname?.startsWith(href) ?? false;
  }

  const sidebarW = collapsed ? 56 : 216;

  /* ── Single nav item ── */
  function NavItem({ item }: { item: typeof navItems[0] }) {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        style={{
          display:         'flex',
          alignItems:      'center',
          gap:             9,
          padding:         collapsed ? '9px 0' : '8px 11px',
          justifyContent:  collapsed ? 'center' : 'flex-start',
          borderRadius:    7,
          marginBottom:    1,
          fontSize:        13,
          fontWeight:      active ? 500 : 400,
          color:           active ? SB.activeText : SB.itemText,
          backgroundColor: active ? SB.activeBg : 'transparent',
          transition:      'all 0.1s ease',
          textDecoration:  'none',
          whiteSpace:      'nowrap',
          overflow:        'hidden',
        }}
        onMouseEnter={e => {
          if (!active) {
            e.currentTarget.style.backgroundColor = SB.itemHover;
            e.currentTarget.style.color = 'rgba(255,255,255,0.85)';
          }
        }}
        onMouseLeave={e => {
          if (!active) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = SB.itemText;
          }
        }}
      >
        <span style={{ flexShrink: 0, color: active ? SB.activeText : SB.itemText }}>
          <Icon name={item.icon} size={16} />
        </span>
        {!collapsed && (
          <span style={{ opacity: 1, transition: 'opacity 0.15s' }}>
            {item.label}
          </span>
        )}
      </Link>
    );
  }

  /* ── Sidebar inner content (reused for desktop + mobile overlay) ── */
  function SidebarContent() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

        {/* Brand */}
        <div
          style={{
            padding:      collapsed ? '20px 0' : '20px 16px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap:          10,
            borderBottom: `1px solid ${SB.divider}`,
            marginBottom: 8,
            flexShrink:   0,
          }}
        >
          <div style={{ flexShrink: 0, lineHeight: 0 }}>
            <Logo size={32} />
          </div>
          {!collapsed && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: SB.brand, lineHeight: 1.2 }}>
                מחר אחר
              </div>
              <div style={{ fontSize: 11, color: SB.brandSub, lineHeight: 1.4 }}>
                שדה חמד
              </div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: collapsed ? '4px 8px' : '4px 10px' }}>
          {navItems.map(item => (
            <NavItem key={item.href} item={item} />
          ))}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div
          style={{
            padding:      '12px',
            borderTop:    `1px solid ${SB.divider}`,
            display:      'flex',
            justifyContent: collapsed ? 'center' : 'flex-end',
          }}
        >
          <button
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
            style={{
              width:           32,
              height:          32,
              borderRadius:    6,
              border:          'none',
              backgroundColor: 'transparent',
              color:           SB.itemText,
              cursor:          'pointer',
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              transition:      'background-color 0.12s',
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = SB.itemHover}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <Icon name={collapsed ? 'chevronLeft' : 'chevronRight'} size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#F6F8FB' }}>

      {/* ── Mobile overlay backdrop ── */}
      {mobileOpen && (
        <div
          style={{
            position:        'fixed',
            inset:           0,
            backgroundColor: 'rgba(15,23,42,0.5)',
            zIndex:          40,
            backdropFilter:  'blur(2px)',
          }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar (overlay) ── */}
      <aside
        className="lg:hidden"
        style={{
          position:        'fixed',
          right:           mobileOpen ? 0 : '-100%',
          top:             0,
          height:          '100vh',
          width:           240,
          backgroundColor: SB.bg,
          zIndex:          50,
          transition:      'right 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflowY:       'auto',
          overflowX:       'hidden',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Desktop sidebar (sticky) ── */}
      <aside
        className="hidden lg:block"
        style={{
          width:           sidebarW,
          flexShrink:      0,
          backgroundColor: SB.bg,
          position:        'sticky',
          top:             0,
          height:          '100vh',
          overflowY:       'auto',
          overflowX:       'hidden',
          transition:      'width 0.2s cubic-bezier(0.4,0,0.2,1)',
          zIndex:          10,
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Main content area ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

        {/* Mobile top bar */}
        <div
          className="lg:hidden"
          style={{
            height:          56,
            backgroundColor: '#FFFFFF',
            borderBottom:    '1px solid #E2E8F0',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         '0 16px',
            position:        'sticky',
            top:             0,
            zIndex:          30,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ lineHeight: 0 }}>
              <Logo size={28} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>מחר אחר</span>
          </div>
          <button
            onClick={() => setMobileOpen(o => !o)}
            style={{ width: 36, height: 36, border: 'none', background: 'none', cursor: 'pointer', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6 }}
          >
            <Icon name={mobileOpen ? 'x' : 'menu'} size={20} />
          </button>
        </div>

        {/* Page content */}
        <main style={{ flex: 1 }}>
          {children}
        </main>
      </div>

      {/* Floating Assistant — only mounted on authenticated pages,
          since this layout already returns early on /login and /auth/*. */}
      <AssistantDrawer />
    </div>
  );
}
