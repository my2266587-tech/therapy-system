'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import Logo from '@/components/ui/Logo';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: typeof window !== 'undefined'
          ? `${window.location.origin}/auth/callback`
          : '/auth/callback',
      },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Heebo', Arial, sans-serif",
        direction: 'rtl',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
          border: '1px solid #E2E8F0',
          padding: '48px 40px',
          width: '100%',
          maxWidth: 420,
          textAlign: 'center',
        }}
      >
        {/* Logo mark */}
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 24,
          filter: 'drop-shadow(0 4px 12px rgba(13,148,136,0.30))',
        }}>
          <Logo size={56} />
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
          מחר אחר – שדה חמד
        </h1>
        <p style={{ color: '#64748B', fontSize: 14, marginBottom: 36 }}>
          מערכת ניהול טיפולי
        </p>

        {error && (
          <div
            style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FCA5A5',
              borderRadius: 8,
              padding: '10px 14px',
              color: '#DC2626',
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 10,
            border: '1.5px solid #E2E8F0',
            backgroundColor: loading ? '#F8FAFC' : '#FFFFFF',
            color: '#0F172A',
            fontSize: 15,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = '#F8FAFC';
              e.currentTarget.style.borderColor = '#CBD5E1';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.backgroundColor = '#FFFFFF';
              e.currentTarget.style.borderColor = '#E2E8F0';
            }
          }}
        >
          {/* Google G icon */}
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
              fill="#4285F4"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
              fill="#34A853"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#FBBC05"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#EA4335"
            />
          </svg>
          {loading ? 'מתחבר...' : 'כניסה עם Google'}
        </button>

        <p style={{ color: '#94A3B8', fontSize: 12, marginTop: 24 }}>
          גישה מורשית בלבד
        </p>
      </div>
    </div>
  );
}
