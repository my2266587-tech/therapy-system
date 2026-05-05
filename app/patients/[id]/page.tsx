'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import PatientForm from '@/components/patients/PatientForm';
import SessionForm from '@/components/sessions/SessionForm';
import SummaryForm from '@/components/summaries/SummaryForm';
import RecordingModal from '@/components/recordings/RecordingModal';
import DocumentUploadModal from '@/components/documents/DocumentUploadModal';
import { patientStatusLabels, housingTypeLabels, sessionStatusLabels, recordingStatusLabels, documentTypeLabels } from '@/lib/labels';
import type { Patient, Session, SessionSummary, Recording, PatientDocument } from '@/types';
import { fmtDate, fmtHebrewDate } from '@/lib/dateUtils';

const TABS = ['פרטים אישיים', 'פגישות', 'סיכומי פגישות', 'הקלטות', 'מסמכים'] as const;
type Tab = typeof TABS[number];

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [patient,           setPatient]           = useState<Patient | null>(null);
  const [sessions,          setSessions]          = useState<Session[]>([]);
  const [summaries,         setSummaries]         = useState<SessionSummary[]>([]);
  const [recordings,        setRecordings]        = useState<Recording[]>([]);
  const [documents,         setDocuments]         = useState<PatientDocument[]>([]);
  const [signedUrls,        setSignedUrls]        = useState<Map<string, string>>(new Map());
  const [activeTab,         setActiveTab]         = useState<Tab>('פרטים אישיים');
  const [docUploadOpen,     setDocUploadOpen]     = useState(false);
  const [loading,           setLoading]           = useState(true);
  const [editOpen,          setEditOpen]          = useState(false);
  const [sessionOpen,       setSessionOpen]       = useState(false);
  const [summaryOpen,       setSummaryOpen]       = useState(false);
  const [recordingOpen,     setRecordingOpen]     = useState(false);
  const [summaryForSession, setSummaryForSession] = useState<Session | null>(null);
  const [transcribingId,    setTranscribingId]    = useState<string | null>(null);
  const [summaryDraft,      setSummaryDraft]      = useState<Record<string, string> | null>(null);
  const [summaryRecordingId, setSummaryRecordingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, sum, rec, docs] = await Promise.all([
      supabase.from('patients')
        .select('*, coordinator:coordinator_id(full_name), staff_member:staff_id(full_name)')
        .eq('id', id).single(),
      supabase.from('sessions').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('session_summaries').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('recordings').select('*').eq('patient_id', id).order('recorded_at', { ascending: false }),
      supabase.from('patient_documents').select('*').eq('patient_id', id).order('uploaded_at', { ascending: false }),
    ]);
    const recData  = (rec.data  ?? []) as Recording[];
    const docData  = (docs.data ?? []) as PatientDocument[];
    setPatient(p.data as Patient);
    setSessions((s.data    ?? []) as Session[]);
    setSummaries((sum.data ?? []) as SessionSummary[]);
    setRecordings(recData);
    setDocuments(docData);
    setLoading(false);

    // Fetch signed URLs for all recordings and documents
    const requests: Array<{ key: string; bucket: string; path: string }> = [
      ...recData.filter(r => r.audio_url).map(r => ({ key: r.id, bucket: 'recordings', path: r.audio_url! })),
      ...docData.filter(d => d.file_url).map(d => ({ key: d.id, bucket: 'documents', path: d.file_url! })),
    ];
    if (requests.length === 0) return;
    const results = await Promise.allSettled(
      requests.map(({ bucket, path }) =>
        fetch('/api/storage/signed-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bucket, path }),
        }).then(r => r.json())
      )
    );
    const urlMap = new Map<string, string>();
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value.signedUrl) {
        urlMap.set(requests[i].key, result.value.signedUrl);
      }
    });
    setSignedUrls(urlMap);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="max-w-screen-xl mx-auto px-6 py-16 text-center text-slate-400 text-sm">טוען...</div>;
  if (!patient) return <div className="max-w-screen-xl mx-auto px-6 py-16 text-slate-500 text-sm">מטופלת לא נמצאה.</div>;

  const coordinatorName = (patient.coordinator  as any)?.full_name as string | undefined;
  const staffName       = (patient.staff_member as any)?.full_name as string | undefined;
  const lastSession     = sessions[0];

  const summaryByRecordingId = new Map(
    summaries.filter(s => s.recording_id).map(s => [s.recording_id!, s])
  );
  const recordingById = new Map(recordings.map(r => [r.id, r]));

  const fixedPatient   = { id, name: patient.full_name };
  const sessionInitial = { patient_id: id } as unknown as Session;
  const summaryInitial = summaryDraft
    ? { patient_id: id, ...summaryDraft } as unknown as SessionSummary
    : summaryForSession
    ? { patient_id: id, session_id: summaryForSession.id } as unknown as SessionSummary
    : { patient_id: id } as unknown as SessionSummary;

  function openSummaryForSession(s: Session) {
    setSummaryForSession(s);
    setSummaryOpen(true);
  }
  function closeSummaryModal() {
    setSummaryOpen(false);
    setSummaryForSession(null);
    setSummaryDraft(null);
    setSummaryRecordingId(null);
  }

  function openManualSummaryFromRecording(recordingId: string) {
    setSummaryRecordingId(recordingId);
    setSummaryForSession(null);
    setSummaryDraft(null);
    setSummaryOpen(true);
  }

  async function handleAutoSummary(r: Recording) {
    if (!r.audio_url) return;
    setTranscribingId(r.id);
    try {
      const res = await fetch('/api/transcribe-recording', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_url: r.audio_url }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const { _mock: _, ...draft } = json;
      setSummaryDraft(draft);
      setSummaryRecordingId(r.id);
      setSummaryOpen(true);
    } catch (err: unknown) {
      alert('שגיאה בתמלול: ' + ((err as Error).message ?? 'שגיאה לא ידועה'));
    } finally {
      setTranscribingId(null);
    }
  }
  function openRecordingTab() {
    setActiveTab('הקלטות');
    setRecordingOpen(true);
  }

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8 space-y-5">

      {/* ── Breadcrumb ─────────────────────────────────────────── */}
      <div className="text-sm text-slate-400">
        <Link href="/patients" className="hover:text-teal-700 transition-colors">מטופלות</Link>
        <span className="mx-2">/</span>
        <span className="text-slate-600">{patient.full_name}</span>
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 px-7 py-6">
        <div className="flex items-start justify-between gap-6 flex-wrap">

          {/* Name + meta */}
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight">{patient.full_name}</h1>
              <Badge value={patient.status} labels={patientStatusLabels} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
              {coordinatorName && (
                <span>רכזת: <span className="text-slate-700 font-medium">{coordinatorName}</span></span>
              )}
              {staffName && (
                <span>איש צוות: <span className="text-slate-700 font-medium">{staffName}</span></span>
              )}
              {patient.phone && <span className="text-slate-400">{patient.phone}</span>}
              {patient.email && <span className="text-slate-400">{patient.email}</span>}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
              עריכת מטופלת
            </button>
            <button
              onClick={openRecordingTab}
              className="px-4 py-2 text-sm border border-red-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors font-medium">
              🎙️ הקלטה חדשה
            </button>
            <button
              onClick={() => setSessionOpen(true)}
              className="px-4 py-2 text-sm border border-teal-200 rounded-lg text-teal-700 hover:bg-teal-50 transition-colors">
              + הוסף פגישה
            </button>
            <button
              onClick={() => setSummaryOpen(true)}
              className="px-4 py-2 text-sm bg-teal-700 rounded-lg text-white hover:bg-teal-800 transition-colors">
              + הוסף סיכום
            </button>
          </div>
        </div>

        {/* ── Stats ────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-100">
          <StatCard label="פגישות"       value={sessions.length} />
          <StatCard label="סיכומי פגישות" value={summaries.length} />
          <StatCard
            label="פגישה אחרונה"
            value={lastSession ? fmtDate(lastSession.date) : '—'}
            sub={lastSession ? fmtHebrewDate(lastSession.date) : undefined}
          />
          <StatCard
            label="סטטוס"
            value={patientStatusLabels[patient.status] ?? patient.status}
            highlight={patient.status === 'active'}
          />
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}>
              {tab}
              {tab === 'הקלטות' && recordings.length > 0 && (
                <span className="mr-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{recordings.length}</span>
              )}
              {tab === 'מסמכים' && documents.length > 0 && (
                <span className="mr-1.5 text-xs bg-slate-100 text-slate-500 rounded-full px-1.5 py-0.5">{documents.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'פרטים אישיים'  && <DetailsTab patient={patient} coordinatorName={coordinatorName} staffName={staffName} />}
          {activeTab === 'פגישות'         && <SessionsTab sessions={sessions} onAddSummary={openSummaryForSession} />}
          {activeTab === 'סיכומי פגישות' && <SummariesTab summaries={summaries} recordingById={recordingById} signedUrls={signedUrls} />}
          {activeTab === 'הקלטות'         && (
            <RecordingsTab
              recordings={recordings}
              onNew={() => setRecordingOpen(true)}
              onCreateSummary={openManualSummaryFromRecording}
              onAutoSummary={handleAutoSummary}
              transcribingId={transcribingId}
              summaryByRecordingId={summaryByRecordingId}
              onViewSummaries={() => setActiveTab('סיכומי פגישות')}
              signedUrls={signedUrls}
            />
          )}
          {activeTab === 'מסמכים' && (
            <DocumentsTab documents={documents} onNew={() => setDocUploadOpen(true)} signedUrls={signedUrls} />
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת פרטי מטופלת" size="xl">
        <PatientForm initial={patient} onSave={() => { setEditOpen(false); load(); }} onCancel={() => setEditOpen(false)} />
      </Modal>

      <Modal open={sessionOpen} onClose={() => setSessionOpen(false)} title="הוספת פגישה">
        <SessionForm
          initial={sessionInitial}
          fixedPatient={fixedPatient}
          onSave={() => { setSessionOpen(false); load(); }}
          onCancel={() => setSessionOpen(false)}
        />
      </Modal>

      <Modal
        open={summaryOpen}
        onClose={closeSummaryModal}
        title={summaryDraft ? '✨ טיוטת סיכום — בדקי ואשרי לפני שמירה' : summaryForSession ? `סיכום פגישה — ${fmtDate(summaryForSession.date)}` : 'הוספת סיכום פגישה'}
        size="xl"
      >
        <SummaryForm
          initial={summaryInitial}
          fixedPatient={fixedPatient}
          recordingId={summaryRecordingId}
          onSave={() => { closeSummaryModal(); load(); setActiveTab('סיכומי פגישות'); }}
          onCancel={closeSummaryModal}
        />
      </Modal>

      <Modal open={recordingOpen} onClose={() => setRecordingOpen(false)} title="הקלטה חדשה" size="md">
        <RecordingModal
          patientId={id}
          onSave={() => { setRecordingOpen(false); load(); setActiveTab('הקלטות'); }}
          onCancel={() => setRecordingOpen(false)}
        />
      </Modal>

      <Modal open={docUploadOpen} onClose={() => setDocUploadOpen(false)} title="העלאת מסמך" size="md">
        <DocumentUploadModal
          patientId={id}
          onSave={() => { setDocUploadOpen(false); load(); setActiveTab('מסמכים'); }}
          onCancel={() => setDocUploadOpen(false)}
        />
      </Modal>
    </div>
  );
}

/* ── Stat card ─────────────────────────────────────────────────── */
function StatCard({ label, value, sub, highlight }: {
  label: string; value: string | number; sub?: string; highlight?: boolean;
}) {
  return (
    <div className="border border-slate-100 rounded-xl px-4 py-3.5 bg-slate-50/50">
      <div className={`text-xl font-bold mb-0.5 ${highlight ? 'text-teal-700' : 'text-slate-700'}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mb-0.5">{sub}</div>}
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

/* ── Personal details ──────────────────────────────────────────── */
function DetailsTab({ patient, coordinatorName, staffName }: {
  patient: Patient; coordinatorName?: string; staffName?: string;
}) {
  const fields: [string, string | null | undefined][] = [
    ['שם מלא',          patient.full_name],
    ['טלפון',           patient.phone],
    ['מייל',            patient.email],
    ['סוג דירה',        patient.housing_type ? housingTypeLabels[patient.housing_type] : null],
    ['כתובת דירה',      patient.apartment_address],
    ['כתובת מגורים',    patient.home_address],
    ['מצב משפחתי',      patient.marital_status],
    ['שם אבא',          patient.father_name],
    ['שם אמא',          patient.mother_name],
    ['מקום במשפחה',     patient.family_position],
    ['רכזת אחראית',     coordinatorName],
    ['איש צוות אחראי', staffName],
    ['הערות',           patient.notes],
  ];
  const visible = fields.filter(([, v]) => !!v);
  if (visible.length === 0) return <Empty msg="אין פרטים להצגה" />;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {visible.map(([label, value]) => (
        <div key={label} className="border border-slate-100 rounded-xl px-4 py-3 bg-slate-50/40">
          <div className="text-xs text-slate-400 mb-1">{label}</div>
          <div className="text-sm font-medium text-slate-700">{value}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Sessions tab ──────────────────────────────────────────────── */
function SessionsTab({ sessions, onAddSummary }: {
  sessions: Session[];
  onAddSummary: (s: Session) => void;
}) {
  if (sessions.length === 0) return <Empty msg="אין פגישות רשומות" />;
  return (
    <div className="space-y-2">
      {sessions.map(s => (
        <div key={s.id} className="border border-slate-100 rounded-xl px-5 py-4 hover:bg-slate-50/60 transition-colors">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-5">
              <div>
                <div className="text-sm font-semibold text-slate-700">{fmtDate(s.date)}</div>
                <div className="text-xs text-slate-400 mt-0.5">{fmtHebrewDate(s.date)}</div>
              </div>
              <div className="text-sm text-slate-500 whitespace-nowrap">{s.start_time} – {s.end_time}</div>
              {s.duration_minutes && (
                <div className="text-xs text-slate-400 whitespace-nowrap">{s.duration_minutes} דק'</div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Badge value={s.status} labels={sessionStatusLabels} />
              <button
                onClick={() => onAddSummary(s)}
                className="text-xs text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors whitespace-nowrap font-medium">
                + סיכום
              </button>
            </div>
          </div>
          {s.notes && (
            <div className="mt-2 text-xs text-slate-400 border-t border-slate-100 pt-2">{s.notes}</div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ── Summaries tab ─────────────────────────────────────────────── */
function SummariesTab({ summaries, recordingById, signedUrls }: {
  summaries: SessionSummary[];
  recordingById: Map<string, Recording>;
  signedUrls: Map<string, string>;
}) {
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [showingPlayer, setShowingPlayer] = useState<Set<string>>(new Set());
  if (summaries.length === 0) return <Empty msg="אין סיכומי פגישות" />;

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    });
  }
  function togglePlayer(id: string) {
    setShowingPlayer(prev => {
      const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
    });
  }

  return (
    <div className="space-y-3">
      {summaries.map(s => {
        const open     = expanded.has(s.id);
        const rec      = s.recording_id ? recordingById.get(s.recording_id) : undefined;
        const playerOn = showingPlayer.has(s.id);
        return (
          <div key={s.id} className="border border-slate-100 rounded-xl px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">{fmtDate(s.date)}</span>
                    {rec && (
                      <span className="text-xs text-violet-600 bg-violet-50 border border-violet-200 rounded px-1.5 py-0.5 font-medium">
                        🎙️ מהקלטה
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">{fmtHebrewDate(s.date)}</div>
                </div>
                {s.start_time && (
                  <div className="text-xs text-slate-400 whitespace-nowrap">
                    {s.start_time} – {s.end_time}
                    {s.duration_minutes ? ` · ${s.duration_minutes} דק'` : ''}
                  </div>
                )}
                {rec && signedUrls.get(rec.id) && (
                  <button
                    onClick={() => togglePlayer(s.id)}
                    className="text-xs text-violet-700 border border-violet-200 rounded-lg px-2.5 py-1 hover:bg-violet-50 transition-colors font-medium">
                    {playerOn ? 'סגור נגן' : '▶ נגן הקלטה'}
                  </button>
                )}
              </div>
              <button
                onClick={() => toggle(s.id)}
                className="text-xs text-teal-700 hover:underline whitespace-nowrap shrink-0 font-medium">
                {open ? 'סגור' : 'פתח סיכום'}
              </button>
            </div>

            {playerOn && rec && (
              <div className="mt-3">
                <audio src={signedUrls.get(rec.id)} controls className="w-full h-10" />
              </div>
            )}

            {!open && (
              <div className="mt-2.5 space-y-1 text-sm text-slate-500">
                {s.current_state     && <p className="line-clamp-1"><span className="font-medium text-slate-600">מצב נוכחי: </span>{s.current_state}</p>}
                {s.main_topics       && <p className="line-clamp-1"><span className="font-medium text-slate-600">נושאים: </span>{s.main_topics}</p>}
                {s.treatment_actions && <p className="line-clamp-1"><span className="font-medium text-slate-600">מה עשינו: </span>{s.treatment_actions}</p>}
              </div>
            )}

            {open && (
              <div className="mt-3 pt-3 border-t border-slate-100 space-y-2 text-sm">
                <SummaryField label="מצב נוכחי"       value={s.current_state} />
                <SummaryField label="נושאים שעלו"      value={s.main_topics} />
                <SummaryField label="מה עשינו בטיפול"  value={s.treatment_actions} />
                <SummaryField label="פגישה הבאה"       value={s.next_steps} />
                <SummaryField label="משימות שקיבלה"    value={s.tasks_given} />
                <SummaryField label="התקדמות"          value={s.progress} />
                <SummaryField label="קשיים"            value={s.difficulties} />
                <SummaryField label="הערות"            value={s.notes} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="font-medium text-slate-500">{label}: </span>
      <span className="text-slate-600">{value}</span>
    </div>
  );
}

/* ── Recordings tab ────────────────────────────────────────────── */
function RecordingsTab({ recordings, onNew, onCreateSummary, onAutoSummary, transcribingId, summaryByRecordingId, onViewSummaries, signedUrls }: {
  recordings: Recording[];
  onNew: () => void;
  onCreateSummary: (recordingId: string) => void;
  onAutoSummary: (r: Recording) => void;
  transcribingId: string | null;
  summaryByRecordingId: Map<string, SessionSummary>;
  onViewSummaries: () => void;
  signedUrls: Map<string, string>;
}) {
  if (recordings.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-slate-400 text-sm">אין הקלטות עדיין</p>
        <button
          onClick={onNew}
          className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors">
          🎙️ התחל הקלטה ראשונה
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onNew}
          className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-xl transition-colors">
          🎙️ הקלטה חדשה
        </button>
      </div>
      {recordings.map(r => (
        <RecordingCard
          key={r.id}
          recording={r}
          signedUrl={signedUrls.get(r.id)}
          hasSummary={summaryByRecordingId.has(r.id)}
          onCreateSummary={() => onCreateSummary(r.id)}
          onAutoSummary={onAutoSummary}
          onViewSummaries={onViewSummaries}
          isTranscribing={transcribingId === r.id}
        />
      ))}
    </div>
  );
}

function RecordingCard({ recording: r, signedUrl, hasSummary, onCreateSummary, onAutoSummary, onViewSummaries, isTranscribing }: {
  recording: Recording;
  signedUrl: string | undefined;
  hasSummary: boolean;
  onCreateSummary: () => void;
  onAutoSummary: (r: Recording) => void;
  onViewSummaries: () => void;
  isTranscribing: boolean;
}) {
  const [duration, setDuration] = useState<number | null>(null);
  const date = new Date(r.recorded_at);

  return (
    <div className="border border-slate-100 rounded-xl px-5 py-4 space-y-3">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="text-sm font-semibold text-slate-700">
            {date.toLocaleDateString('he-IL')}
          </div>
          <div className="text-xs text-slate-400">
            {date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
            {duration !== null && <span className="mr-2">· {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')} דק'</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge value={r.status} labels={recordingStatusLabels} />
          {hasSummary ? (
            <>
              <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1 font-medium">
                ✓ סוכם
              </span>
              <button
                onClick={onViewSummaries}
                className="text-xs text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors whitespace-nowrap font-medium">
                פתח סיכום
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onCreateSummary}
                className="text-xs text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors whitespace-nowrap font-medium">
                צור סיכום
              </button>
              <button
                onClick={() => onAutoSummary(r)}
                disabled={isTranscribing || !r.audio_url}
                className="text-xs text-violet-700 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-50 transition-colors whitespace-nowrap font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5" title={!r.audio_url ? 'אין קובץ שמע' : undefined}>
                {isTranscribing ? (
                  <>
                    <span className="w-3 h-3 border-2 border-violet-300 border-t-violet-700 rounded-full animate-spin" />
                    מתמלל...
                  </>
                ) : '✨ סיכום אוטומטי'}
              </button>
            </>
          )}
          {signedUrl && (
            <a
              href={signedUrl}
              download
              className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
              הורדה
            </a>
          )}
        </div>
      </div>

      {signedUrl ? (
        <audio
          src={signedUrl}
          controls
          className="w-full h-10"
          onLoadedMetadata={e => setDuration((e.target as HTMLAudioElement).duration)}
        />
      ) : (
        <div className="text-xs text-slate-400 bg-slate-50 rounded-lg px-4 py-3">
          {r.audio_url ? 'טוען נגן...' : 'קובץ אודיו לא זמין'}
        </div>
      )}
    </div>
  );
}

/* ── Documents tab ─────────────────────────────────────────────── */
const DOC_ICONS: Record<string, string> = {
  personal_document:        '📋',
  psychological_tracking:   '🧠',
  session_summary_document: '📝',
  other:                    '📄',
};

const DOC_COLORS: Record<string, string> = {
  personal_document:        'bg-slate-100 text-slate-700',
  psychological_tracking:   'bg-blue-100 text-blue-700',
  session_summary_document: 'bg-teal-100 text-teal-700',
  other:                    'bg-slate-100 text-slate-600',
};

function DocumentsTab({ documents, onNew, signedUrls }: {
  documents: PatientDocument[];
  onNew: () => void;
  signedUrls: Map<string, string>;
}) {
  if (documents.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <p className="text-slate-400 text-sm">אין מסמכים עדיין</p>
        <button
          onClick={onNew}
          className="px-5 py-2.5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-xl transition-colors">
          📎 העלאת מסמך ראשון
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onNew}
          className="px-4 py-2 bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium rounded-xl transition-colors">
          + העלאת מסמך
        </button>
      </div>

      {documents.map(doc => {
        const uploaded = new Date(doc.uploaded_at);
        const icon     = DOC_ICONS[doc.document_type] ?? '📄';
        const badgeCls = DOC_COLORS[doc.document_type] ?? 'bg-slate-100 text-slate-600';
        const typeLabel = documentTypeLabels[doc.document_type] ?? doc.document_type;

        const docSignedUrl = signedUrls.get(doc.id);
        return (
          <div key={doc.id} className="border border-slate-100 rounded-xl px-5 py-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              {/* Icon + info */}
              <div className="flex items-start gap-3 min-w-0">
                <span className="text-2xl shrink-0 mt-0.5">{icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">{doc.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badgeCls}`}>
                      {typeLabel}
                    </span>
                    <span className="text-xs text-slate-400">
                      {uploaded.toLocaleDateString('he-IL')}
                    </span>
                    <span className="text-xs text-slate-400 truncate max-w-[160px]">
                      {doc.file_name}
                    </span>
                  </div>
                  {doc.notes && (
                    <p className="mt-1.5 text-xs text-slate-500 line-clamp-2">{doc.notes}</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {docSignedUrl ? (
                  <>
                    <a
                      href={docSignedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-700 border border-teal-200 rounded-lg px-3 py-1.5 hover:bg-teal-50 transition-colors font-medium whitespace-nowrap">
                      פתח מסמך
                    </a>
                    <a
                      href={docSignedUrl}
                      download={doc.file_name}
                      className="text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors whitespace-nowrap">
                      הורדה
                    </a>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">טוען...</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <p className="text-center py-12 text-slate-400 text-sm">{msg}</p>;
}
