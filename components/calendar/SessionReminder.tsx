'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { Session } from '@/types';

/**
 * "שליחת תזכורת" bar shown above the session form when a session is opened
 * from the appointments calendar.
 *
 * Clicking the button builds a ready-made Hebrew reminder from the patient's
 * name + the session date and time, and offers three manual channels:
 * WhatsApp (wa.me), email (mailto) or copying the text — using the phone and
 * email already stored on the patient card. Any of the three stamps
 * sessions.reminder_sent_at so the UI shows "תזכורת נשלחה" with date+time.
 * No automatic sending / SMS at this stage.
 */

const C = {
  border: '#E8ECF0', accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
};

interface PatientContact { full_name: string; phone: string | null; email: string | null; }

interface Props {
  session: Session;
  /** Called after the sent-stamp is persisted so the calendar can refresh. */
  onSent: () => void;
}

/** "DD/MM/YYYY" from ISO, no timezone drift. */
function ddmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
/** "HH:MM" from a time column value. */
function hm(t: string | null | undefined): string { return t ? t.slice(0, 5) : ''; }

/** Israeli phone → international digits for wa.me (05X… → 9725X…). */
function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

/** "DD/MM/YYYY HH:MM" for the sent stamp. */
function stampLabel(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function SessionReminder({ session, onSent }: Props) {
  const [contact, setContact] = useState<PatientContact | null>(null);
  const [open,    setOpen]    = useState(false);
  const [sentAt,  setSentAt]  = useState<string | null>(session.reminder_sent_at ?? null);
  const [copied,  setCopied]  = useState(false);
  const [error,   setError]   = useState('');

  // The caller passes key={session.id}, so this component remounts per
  // session — useState initials handle the reset; here we only fetch.
  useEffect(() => {
    supabase
      .from('patients')
      .select('full_name, phone, email')
      .eq('id', session.patient_id)
      .maybeSingle()
      .then(({ data }) => setContact((data as PatientContact | null) ?? null));
  }, [session.patient_id]);

  const name = contact?.full_name ?? (session.patient as { full_name?: string } | null)?.full_name ?? '';
  const message = `שלום ${name}, תזכורת לפגישה שנקבעה לתאריך ${ddmmyyyy(session.date)} בשעה ${hm(session.start_time)}.`;

  /** Stamp reminder_sent_at (best-effort — the send itself already happened). */
  async function markSent() {
    const now = new Date().toISOString();
    setSentAt(now);
    const { error: err } = await supabase
      .from('sessions')
      .update({ reminder_sent_at: now })
      .eq('id', session.id);
    if (err) {
      console.error('[session-reminder] stamp failed:', err.message);
      setError('השליחה בוצעה אך סימון "נשלחה" לא נשמר');
      return;
    }
    onSent();
  }

  function handleWhatsApp() {
    if (!contact?.phone) return;
    window.open(`https://wa.me/${waNumber(contact.phone)}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    markSent();
  }

  function handleEmail() {
    if (!contact?.email) return;
    window.location.href =
      `mailto:${contact.email}?subject=${encodeURIComponent('תזכורת לפגישה')}&body=${encodeURIComponent(message)}`;
    markSent();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      markSent();
    } catch {
      setError('ההעתקה נכשלה');
    }
  }

  return (
    <div style={{
      marginBottom: 16, borderRadius: 12,
      border: `1px solid ${C.border}`, backgroundColor: '#F8FAFC',
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
            border: `1px solid ${open ? C.accentRim : C.border}`,
            backgroundColor: open ? C.accentSub : '#FFFFFF',
            color: open ? C.accent : C.sub, cursor: 'pointer', transition: 'all 0.12s',
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          שליחת תזכורת
        </button>

        {/* Sent stamp */}
        {sentAt && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 600, color: '#16A34A',
            backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: 999, padding: '4px 10px',
          }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            תזכורת נשלחה · {stampLabel(sentAt)}
          </span>
        )}
      </div>

      {open && (
        <div style={{ marginTop: 10 }}>
          {/* Ready-made message preview */}
          <div style={{
            fontSize: 13, color: C.text, lineHeight: 1.6,
            backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`,
            borderRadius: 9, padding: '10px 12px', marginBottom: 10,
          }}>
            {message}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <ChannelBtn
              label="פתיחה בוואטסאפ"
              color="#16A34A"
              disabled={!contact?.phone}
              title={contact?.phone ? contact.phone : 'אין טלפון בכרטיס המטופלת'}
              onClick={handleWhatsApp}
            />
            <ChannelBtn
              label="שליחה במייל"
              color="#2563EB"
              disabled={!contact?.email}
              title={contact?.email ? contact.email : 'אין מייל בכרטיס המטופלת'}
              onClick={handleEmail}
            />
            <ChannelBtn
              label={copied ? 'הועתק ✓' : 'העתקת ההודעה'}
              color={C.accent}
              disabled={false}
              title="העתקה ללוח"
              onClick={handleCopy}
            />
          </div>

          {(!contact?.phone || !contact?.email) && (
            <p style={{ fontSize: 11.5, color: C.muted, margin: '8px 0 0' }}>
              {!contact?.phone && 'אין טלפון שמור בכרטיס המטופלת. '}
              {!contact?.email && 'אין מייל שמור בכרטיס המטופלת.'}
            </p>
          )}
          {error && <p style={{ fontSize: 12, color: '#DC2626', margin: '8px 0 0' }}>{error}</p>}
        </div>
      )}
    </div>
  );
}

function ChannelBtn({ label, color, disabled, title, onClick }: {
  label: string; color: string; disabled: boolean; title: string; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '7px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
        border: `1px solid ${disabled ? '#E8ECF0' : `${color}55`}`,
        backgroundColor: disabled ? '#F8FAFC' : `${color}14`,
        color: disabled ? '#94A3B8' : color,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.12s',
      }}
    >
      {label}
    </button>
  );
}
