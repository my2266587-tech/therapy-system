import type { ReactNode } from 'react';

/**
 * Centered status message for whole-page states: error, not found, loading.
 * Inline styles only (no globals.css dependency) so it also renders inside
 * app/global-error.tsx, which replaces the root layout.
 */
export default function StatusMessage({ title, text, children }: {
  title: string;
  text?: string;
  children?: ReactNode;
}) {
  return (
    <div style={{
      minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, direction: 'rtl', fontFamily: "'Heebo', Arial, sans-serif",
    }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>{title}</div>
        {text && <div style={{ fontSize: 14, color: '#64748B', lineHeight: 1.7 }}>{text}</div>}
        {children && (
          <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

export const statusButtonStyle = (primary: boolean) => ({
  padding: '10px 20px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  textDecoration: 'none', fontFamily: 'inherit',
  border: primary ? '1px solid #0D9488' : '1px solid #E2E8F0',
  backgroundColor: primary ? '#0D9488' : '#FFFFFF',
  color: primary ? '#FFFFFF' : '#0F172A',
}) as const;
