'use client';

import Link from 'next/link';

const cards = [
  {
    href: '/settings/lists',
    icon: '🗂️',
    title: 'רשימות ותוויות',
    desc: 'עריכת האפשרויות והטקסטים בתפריטים בכל המערכת — סטטוסים, סוגי טיפול, אמצעי תשלום ועוד.',
  },
  {
    href: '/settings/users',
    icon: '👥',
    title: 'משתמשים והרשאות',
    desc: 'ניהול גישה למערכת — הוספה, השבתה ושינוי תפקיד של משתמשים.',
  },
  {
    href: '/hour-bank',
    icon: '⏱️',
    title: 'בנק שעות',
    desc: 'מכסת שעות העבודה מול הלקוחה — טיימר, יתרה, הטענה מחדש והיסטוריית שימושים.',
  },
];

export default function SettingsHomePage() {
  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '32px 24px',
        direction: 'rtl',
        fontFamily: "'Heebo', Arial, sans-serif",
      }}
    >
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', margin: '0 0 4px' }}>
          הגדרות מערכת
        </h1>
        <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>
          ניהול ההגדרות הניתנות לעריכה מהממשק — ללא צורך בשינוי קוד.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {cards.map(c => (
          <Link
            key={c.href}
            href={c.href}
            style={{
              display: 'block',
              backgroundColor: '#FFFFFF',
              borderRadius: 12,
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              padding: '22px 24px',
              textDecoration: 'none',
              transition: 'border-color 0.12s, box-shadow 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#99F6E4';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,118,110,0.10)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#E2E8F0';
              e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
            }}
          >
            <div style={{ fontSize: 26, marginBottom: 10 }}>{c.icon}</div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 6px' }}>
              {c.title}
            </h2>
            <p style={{ fontSize: 13, color: '#64748B', margin: 0, lineHeight: 1.6 }}>{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
