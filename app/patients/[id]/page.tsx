'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import PatientForm from '@/components/patients/PatientForm';
import {
  patientStatusLabels, housingTypeLabels, maritalStatusLabels,
  sessionStatusLabels, recordingStatusLabels,
} from '@/lib/labels';
import type { Patient, Session, SessionSummary, Recording, PrivateExpense } from '@/types';

const TABS = ['פרטים', 'פגישות', 'סיכומים', 'הקלטות', 'הוצאות'] as const;

const thStyle: React.CSSProperties = {
  padding: '0.625rem 0.875rem',
  textAlign: 'right',
  fontWeight: 600,
  fontSize: '0.6875rem',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#6b7b6e',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #e5ddd4',
};

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [patient,    setPatient]    = useState<Patient | null>(null);
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [summaries,  setSummaries]  = useState<SessionSummary[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [expenses,   setExpenses]   = useState<PrivateExpense[]>([]);
  const [activeTab,  setActiveTab]  = useState<typeof TABS[number]>('פרטים');
  const [loading,    setLoading]    = useState(true);
  const [editOpen,   setEditOpen]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, sum, rec, exp] = await Promise.all([
      supabase.from('patients').select('*, coordinator:coordinator_id(full_name), staff_member:staff_id(full_name)').eq('id', id).single(),
      supabase.from('sessions').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('session_summaries').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('recordings').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }),
      supabase.from('private_expenses').select('*').eq('patient_id', id).order('date', { ascending: false }),
    ]);
    setPatient(p.data as Patient);
    setSessions((s.data ?? []) as Session[]);
    setSummaries((sum.data ?? []) as SessionSummary[]);
    setRecordings((rec.data ?? []) as Recording[]);
    setExpenses((exp.data ?? []) as PrivateExpense[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-20 text-center">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent mx-auto mb-3 animate-spin"
          style={{ borderColor: '#1f623e', borderTopColor: 'transparent' }}
        />
        <p className="text-sm" style={{ color: '#8fa49a' }}>טוען פרטי מטופלת...</p>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="max-w-screen-xl mx-auto px-6 py-12">
        <p style={{ color: '#6b7b6e' }}>מטופלת לא נמצאה.</p>
      </div>
    );
  }

  const totalExpenses = expenses.reduce((s, e) => s + Number(e.cost), 0);

  const initials = patient.full_name
    .split(' ')
    .slice(0, 2)
    .map(w => w[0])
    .join('');

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm mb-6" style={{ color: '#8fa49a' }}>
        <Link href="/patients" style={{ color: '#1f623e' }} className="hover:underline">
          מטופלות
        </Link>
        <span>/</span>
        <span style={{ color: '#1a2620', fontWeight: 500 }}>{patient.full_name}</span>
      </div>

      {/* ── Hero card ── */}
      <div
        className="bg-white rounded-2xl p-6 mb-6"
        style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px rgba(26,38,32,0.06)' }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div
              className="w-14 h-14 rounded-xl flex items-center justify-center text-white text-xl font-bold shrink-0"
              style={{
                background: 'linear-gradient(135deg, #1f623e, #2d7a52)',
                boxShadow: '0 2px 8px rgba(31,98,62,0.25)',
              }}
            >
              {initials}
            </div>

            <div>
              <div className="flex items-center gap-3 flex-wrap mb-2">
                <h1 className="text-xl font-bold" style={{ color: '#1a2620' }}>
                  {patient.full_name}
                </h1>
                <Badge value={patient.status} labels={patientStatusLabels} />
              </div>
              <div className="flex flex-wrap gap-4 text-sm" style={{ color: '#6b7b6e' }}>
                {patient.phone && (
                  <span className="flex items-center gap-1">
                    <span style={{ color: '#c49438' }}>☎</span> {patient.phone}
                  </span>
                )}
                {patient.email && (
                  <span className="flex items-center gap-1">
                    <span style={{ color: '#c49438' }}>✉</span> {patient.email}
                  </span>
                )}
                {patient.housing_type && (
                  <span>{housingTypeLabels[patient.housing_type]}</span>
                )}
                {(patient.coordinator as any)?.full_name && (
                  <span>רכזת: {(patient.coordinator as any).full_name}</span>
                )}
              </div>
            </div>
          </div>

          <button
            onClick={() => setEditOpen(true)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              border: '1px solid #e5ddd4',
              color: '#4a5e52',
              backgroundColor: '#faf7f2',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = '#eef6f1';
              e.currentTarget.style.borderColor = '#a9d5ba';
              e.currentTarget.style.color = '#1f623e';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = '#faf7f2';
              e.currentTarget.style.borderColor = '#e5ddd4';
              e.currentTarget.style.color = '#4a5e52';
            }}
          >
            ערוך פרטים
          </button>
        </div>

        {/* Mini stats */}
        <div
          className="grid grid-cols-4 gap-4 mt-6 pt-5"
          style={{ borderTop: '1px solid #f0ece5' }}
        >
          {[
            { label: 'פגישות',  value: sessions.length },
            { label: 'סיכומים', value: summaries.length },
            { label: 'הקלטות',  value: recordings.length },
            { label: 'הוצאות',  value: `₪${totalExpenses.toLocaleString('he-IL', { minimumFractionDigits: 0 })}` },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#1a2620' }}>{s.value}</div>
              <div className="text-xs mt-0.5" style={{ color: '#8fa49a' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs + content ── */}
      <div
        className="bg-white rounded-2xl overflow-hidden"
        style={{ border: '1px solid #e5ddd4', boxShadow: '0 1px 4px rgba(26,38,32,0.06)' }}
      >
        {/* Tab bar */}
        <div
          className="flex overflow-x-auto"
          style={{ borderBottom: '1px solid #e5ddd4', backgroundColor: '#faf7f2' }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-all relative"
                style={{
                  color: isActive ? '#1f623e' : '#6b7b6e',
                  fontWeight: isActive ? 600 : 400,
                  backgroundColor: isActive ? '#ffffff' : 'transparent',
                  borderBottom: isActive ? '2px solid #1f623e' : '2px solid transparent',
                }}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="p-6">
          {activeTab === 'פרטים'   && <DetailsTab patient={patient} />}
          {activeTab === 'פגישות'  && <SessionsTab sessions={sessions} />}
          {activeTab === 'סיכומים' && <SummariesTab summaries={summaries} />}
          {activeTab === 'הקלטות'  && <RecordingsTab recordings={recordings} />}
          {activeTab === 'הוצאות'  && <ExpensesTab expenses={expenses} total={totalExpenses} />}
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
    ['שם מלא',        patient.full_name],
    ['טלפון',         patient.phone],
    ['מייל',          patient.email],
    ['סוג דירה',      patient.housing_type ? housingTypeLabels[patient.housing_type] : null],
    ['כתובת דירה',    patient.apartment_address],
    ['כתובת מגורים',  patient.home_address],
    ['מצב משפחתי',    patient.marital_status ? (maritalStatusLabels[patient.marital_status] ?? patient.marital_status) : null],
    ['שם אבא',        patient.father_name],
    ['שם אמא',        patient.mother_name],
    ['מקום במשפחה',   patient.family_position],
    ['הערות',         patient.notes],
  ];

  const visible = rows.filter(([, v]) => !!v);
  if (visible.length === 0) return <Empty msg="אין פרטים להצגה" />;

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {visible.map(([label, value]) => (
        <div
          key={label}
          className="rounded-xl p-4"
          style={{ backgroundColor: '#faf7f2', border: '1px solid #f0ece5' }}
        >
          <dt className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#8fa49a', letterSpacing: '0.06em' }}>
            {label}
          </dt>
          <dd className="text-sm font-medium" style={{ color: '#1a2620' }}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SessionsTab({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return <Empty msg="אין פגישות רשומות" />;
  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: '#faf7f2' }}>
            {['תאריך', 'שעות', 'משך', 'סטטוס', 'הערות'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr
              key={s.id}
              style={{ borderBottom: i < sessions.length - 1 ? '1px solid #f0ece5' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#faf7f2')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              <td className="py-3 px-4 font-medium" style={{ color: '#1a2620' }}>{s.date}</td>
              <td className="py-3 px-4 whitespace-nowrap" style={{ color: '#4a5e52' }}>
                {s.start_time} – {s.end_time}
              </td>
              <td className="py-3 px-4" style={{ color: '#6b7b6e' }}>
                {s.duration_minutes ? `${s.duration_minutes} דק'` : '—'}
              </td>
              <td className="py-3 px-4">
                <Badge value={s.status} labels={sessionStatusLabels} />
              </td>
              <td className="py-3 px-4" style={{ color: '#8fa49a' }}>{s.notes ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummariesTab({ summaries }: { summaries: SessionSummary[] }) {
  if (summaries.length === 0) return <Empty msg="אין סיכומים רשומים" />;
  return (
    <div className="space-y-4">
      {summaries.map(s => (
        <div
          key={s.id}
          className="rounded-xl p-5"
          style={{ border: '1px solid #e5ddd4', borderRight: '3px solid #c49438' }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="font-semibold text-sm" style={{ color: '#1a2620' }}>{s.date}</span>
            {s.start_time && (
              <span className="text-xs" style={{ color: '#8fa49a' }}>
                {s.start_time} – {s.end_time}
              </span>
            )}
          </div>
          {s.main_topics && (
            <p className="text-sm mb-2" style={{ color: '#4a5e52' }}>
              <span className="font-medium" style={{ color: '#6b7b6e' }}>נושאים: </span>
              {s.main_topics}
            </p>
          )}
          {s.treatment_actions && (
            <p className="text-sm mb-2" style={{ color: '#4a5e52' }}>
              <span className="font-medium" style={{ color: '#6b7b6e' }}>מה עשינו: </span>
              {s.treatment_actions}
            </p>
          )}
          {s.progress && (
            <p className="text-sm" style={{ color: '#4a5e52' }}>
              <span className="font-medium" style={{ color: '#6b7b6e' }}>התקדמות: </span>
              {s.progress}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function RecordingsTab({ recordings }: { recordings: Recording[] }) {
  if (recordings.length === 0) return <Empty msg="אין הקלטות" />;
  return (
    <div className="overflow-x-auto -mx-6">
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: '#faf7f2' }}>
            {['תאריך', 'סטטוס', 'תמלול', 'טיוטה'].map(h => (
              <th key={h} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {recordings.map((r, i) => (
            <tr
              key={r.id}
              style={{ borderBottom: i < recordings.length - 1 ? '1px solid #f0ece5' : 'none' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#faf7f2')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '')}
            >
              <td className="py-3 px-4" style={{ color: '#4a5e52' }}>
                {new Date(r.recorded_at).toLocaleDateString('he-IL')}
              </td>
              <td className="py-3 px-4">
                <Badge value={r.status} labels={recordingStatusLabels} />
              </td>
              <td className="py-3 px-4">
                <span
                  className="text-xs font-medium"
                  style={{ color: r.transcript ? '#1f623e' : '#8fa49a' }}
                >
                  {r.transcript ? 'קיים' : '—'}
                </span>
              </td>
              <td className="py-3 px-4">
                <span
                  className="text-xs font-medium"
                  style={{ color: r.draft_summary ? '#1f623e' : '#8fa49a' }}
                >
                  {r.draft_summary ? 'קיים' : '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpensesTab({ expenses, total }: { expenses: PrivateExpense[]; total: number }) {
  if (expenses.length === 0) return <Empty msg="אין הוצאות" />;
  return (
    <div>
      <div
        className="rounded-xl px-5 py-3.5 mb-5 flex items-center justify-between"
        style={{ backgroundColor: '#fdf6ec', border: '1px solid #f0d090' }}
      >
        <span className="text-sm" style={{ color: '#92600d' }}>סה"כ הוצאות</span>
        <span className="text-lg font-bold" style={{ color: '#1a2620' }}>
          ₪{total.toLocaleString('he-IL', { minimumFractionDigits: 2 })}
        </span>
      </div>
      <div className="overflow-x-auto -mx-6">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ backgroundColor: '#faf7f2' }}>
              {['תאריך', 'סוג טיפול', 'חומרים', 'עלות'].map(h => (
                <th key={h} style={thStyle}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {expenses.map((e, i) => (
              <tr
                key={e.id}
                style={{ borderBottom: i < expenses.length - 1 ? '1px solid #f0ece5' : 'none' }}
                onMouseEnter={ev => (ev.currentTarget.style.backgroundColor = '#faf7f2')}
                onMouseLeave={ev => (ev.currentTarget.style.backgroundColor = '')}
              >
                <td className="py-3 px-4" style={{ color: '#4a5e52' }}>{e.date}</td>
                <td className="py-3 px-4" style={{ color: '#4a5e52' }}>{e.treatment_type}</td>
                <td className="py-3 px-4" style={{ color: '#8fa49a' }}>{e.materials ?? '—'}</td>
                <td className="py-3 px-4 font-semibold" style={{ color: '#1a2620' }}>
                  ₪{Number(e.cost).toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="py-14 text-center">
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-lg mx-auto mb-3"
        style={{ backgroundColor: '#f2ebe0', color: '#c49438' }}
      >
        ◌
      </div>
      <p className="text-sm" style={{ color: '#8fa49a' }}>{msg}</p>
    </div>
  );
}
