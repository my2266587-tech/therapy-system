import type { Metadata } from 'next';
import './globals.css';
import SidebarLayout from '@/components/layout/SidebarLayout';
import { SettingsProvider } from '@/lib/settings/SettingsProvider';

export const metadata: Metadata = {
  title: 'מחר אחר – שדה חמד',
  description: 'מערכת ניהול טיפולית',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <SettingsProvider>
          <SidebarLayout>
            {children}
          </SidebarLayout>
        </SettingsProvider>
      </body>
    </html>
  );
}
