'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import PatientForm from '@/components/patients/PatientForm';
import {
  patientStatusLabels, housingTypeLabels, maritalStatusLabels,
  sessionStatusLabels, recordingStatusLabels,
} from '@/lib/labels';
import type { Patient, Session, SessionSummary, Recording } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const TABS = ['פרטים', 'פגישות', 'סיכומי פגישות', 'מסמכים', 'משימות', 'הערות'] as const;
type Tab = typeof TABS[number];

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  active:     { label: 'פעילה',     bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4' },
  inactive:   { label: 'לא פעילה',  bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' },
  discharged: { label: 'שוחררה',    bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  waitlist:   { label: 'רשימת המתנה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
};

const SESSION_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  planned:   { label: 'מתוכננת',  bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  completed: { label: 'הושלמה',   bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  cancelled: { label: 'בוטלה',    bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', dot: '#DC2626' },
  no_show:   { label: 'לא הגיעה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

const AVATAR_COLORS = ['#0D9488','#4F46E5','#9333EA','#0284C7','#059669','#D97706'];

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2);
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [patient,    setPatient]    = useState<Patient | null>(null);
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [summaries,  setSummaries]  = useState<SessionSummary[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [activeTab,  setActiveTab]  = useState<Tab>('פרטים');
  const [loading,    setLoading]    = useState(true);
  const [editOpen,   setEditOpen]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, sum, rec] = await Promise.all([
      supabase.from('patients').select('*, coordinator:coordinator_id(full_name), staff_member:staff_id(full_name)').eq('id', id).single(),
      supabase.from('sessions').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('session_summaries').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('recordings').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }),
    ]);
    setPatient(p.data as Patient);
    setSessions((s.data ?? []) as Session[]);
    setSummaries((sum.data ?? []) as SessionSummary[]);
    setRecordings((rec.data ?? []) as Recording[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: `2.5px solid ${C.accentRim}`, borderTopColor: C.accent,
            margin: '0 auto 12px', animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 13, color: C.muted }}>טוען פרטי מטופלת...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px', direction: 'rtl' }}>
        <p style={{ color: C.sub }}>מטופלת לא נמצאה.</p>
      </div>
    );
  }

  const color = avatarColor(patient.full_name);
  const ini   = initials(patient.full_name);
  const st    = STATUS_STYLE[patient.status] ?? STATUS_STYLE.inactive;

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '32px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 22, color: C.muted }}>
          <Link href="/patients" style={{ color: C.accent, textDecoration: 'none', fontWeight: 500 }}>מטופלות</Link>
          <span>/</span>
          <span style={{ color: C.text, fontWeight: 500 }}>{patient.full_name}</span>
        </div>

        {/* ── Hero ── */}
        <div style={{
          backgroundColor: C.card, borderRadius: 18,
          border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          padding: '28px 32px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>

            {/* Left: avatar + info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, flexShrink: 0,
                backgroundColor: color + '18', border: `2px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color, letterSpacing: '0.02em',
              }}>
                {ini}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
                    {patient.full_name}
                  </h1>
                  <span style={{
                    padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
                  }}>
                    {st.label}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: C.sub }}>
                  {patient.phone && <span>{patient.phone}</span>}
                  {patient.email && <span>{patient.email}</span>}
                  {patient.housing_type && <span>{housingTypeLabels[patient.housing_type]}</span>}
                  {(patient.coordinator as any)?.full_name && (
                    <span>רכזת: {(patient.coordinator as any).full_name}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Edit button */}
            <button
              onClick={() => setEditOpen(true)}
              style={{
                padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                border: `1px solid ${C.border}`, color: C.sub, backgroundColor: C.card,
                cursor: 'pointer', transition: 'all 0.12s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.backgroundColor = C.accentSub;
                el.style.borderColor = C.accentRim;
                el.style.color = C.accent;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.backgroundColor = C.card;
                el.style.borderColor = C.border;
                el.style.color = C.sub;
              }}
            >
              ערוך פרטים
            </button>
          </div>

          {/* Mini stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`,
          }}>
            {[
              { label: 'פגישות',  value: sessions.length },
              { label: 'סיכומים', value: summaries.length },
              { label: 'הקלטות',  value: recordings.length },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          backgroundColor: C.card, borderRadius: 16,
          border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
        }}>
          {/* Tab bar */}
          <div style={{
            display: 'flex', overflowX: 'auto',
            borderBottom: `1px solid ${C.border}`,
            backgroundColor: '#F8FAFC',
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '14px 20px', fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? C.accent : C.sub,
                    backgroundColor: isActive ? C.card : 'transparent',
                    border: 'none', borderBottom: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.1s',
                    outline: 'none',
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div style={{ padding: '24px 28px' }}>
            {activeTab === 'פרטים'          && <DetailsTab patient={patient} />}
            {activeTab === 'פגישות'         && <SessionsTab sessions={sessions} />}
            {activeTab === 'סיכומי פגישות'  && <SummariesTab summaries={summaries} />}
            {activeTab === 'מסמכים'         && <ComingSoon label="מסמכים" />}
            {activeTab === 'משימות'         && <ComingSoon label="משימות" />}
            {activeTab === 'הערות'          && <ComingSoon label="הערות" />}
          </div>
        </div>

      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת פרטי מטופלת" size="xl">
        <PatientForm
          initial={patient}
          onSave={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>
    </div>
  );
}

/* ── Tab components ── */

function DetailsTab({ patient }: { patient: Patient }) {
  const rows: [string, string | null | undefined][] = [
    ['שם מלא',       patient.full_name],
    ['טלפון',        patient.phone],
    ['מייל',         patient.email],
    ['סוג דירה',     patient.housing_type ? housingTypeLabels[patient.housing_type] : null],
    ['כתובת דירה',   patient.apartment_address],
    ['כתובת מגורים', patient.home_address],
    ['מצב משפחתי',   patient.marital_status ? (maritalStatusLabels[patient.marital_status] ?? patient.marital_status) : null],
    ['שם אבא',       patient.father_name],
    ['שם אמא',       patient.mother_name],
    ['מקום במשפחה',  patient.family_position],
    ['הערות',        patient.notes],
  ];

  const visible = rows.filter(([, v]) => !!v);
  if (visible.length === 0) return <Empty msg="אין פרטים להצגה" />;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {visible.map(([label, value]) => (
        <div key={label} style={{
          borderRadius: 10, padding: '14px 16px',
          backgroundColor: '#F8FAFC', border: '1px solid #E8ECF0',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5 }}>
            {label}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: '#1A2332' }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return <Empty msg="אין פגישות רשומות" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sessions.map(s => {
        const st = SESSION_STATUS[s.status] ?? SESSION_STATUS.planned;
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 16px', borderRadius: 10,
            backgroundColor: '#F8FAFC', border: '1px solid #E8ECF0',
          }}>
            <div style={{
              minWidth: 46, textAlign: 'center', flexShrink: 0,
              backgroundColor: '#FFFFFF', border: '1px solid #E8ECF0',
              borderRadius: 8, padding: '5px 4px',
            }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1A2332', margin: 0, lineHeight: 1 }}>
                {new Date(s.date).getDate()}
              </p>
              <p style={{ fontSize: 9, color: '#94A3B8', margin: '2px 0 0', textTransform: 'uppercase' }}>
                {new Date(s.date).toLocaleDateString('he-IL', { month: 'short' })}
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#1A2332', margin: 0 }}>
                {s.start_time} – {s.end_time}
                {s.duration_minutes ? ` · ${s.duration_minutes} דק'` : ''}
              </p>
              {s.notes && (
                <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>{s.notes}</p>
              )}
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`, flexShrink: 0,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: st.dot, display: 'inline-block' }} />
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummariesTab({ summaries }: { summaries: SessionSummary[] }) {
  if (summaries.length === 0) return <Empty msg="אין סיכומים רשומים" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {summaries.map(s => (
        <div key={s.id} style={{
          borderRadius: 12, padding: '18px 20px',
          border: `1px solid #E8ECF0`, borderRight: `3px solid #0D9488`,
          backgroundColor: '#FAFCFF',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#1A2332' }}>{s.date}</span>
            {s.start_time && (
              <span style={{ fontSize: 12, color: '#94A3B8' }}>{s.start_time} – {s.end_time}</span>
            )}
          </div>
          {s.main_topics && (
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 6px' }}>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>נושאים: </span>{s.main_topics}
            </p>
          )}
          {s.treatment_actions && (
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 6px' }}>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>מה עשינו: </span>{s.treatment_actions}
            </p>
          )}
          {s.progress && (
            <p style={{ fontSize: 13, color: '#64748B', margin: 0 }}>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>התקדמות: </span>{s.progress}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
        backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: '#0D9488',
      }}>
        ◌
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', margin: '0 0 4px' }}>
        {label} — בקרוב
      </p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>פיצ'ר זה יתווסף בגרסה הבאה</p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', margin: '0 auto 10px',
        backgroundColor: '#F0FDF9', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color: '#0D9488',
      }}>
        ◌
      </div>
      <p style={{ fontSize: 13, color: '#94A3B8' }}>{msg}</p>
    </div>
  );
}
