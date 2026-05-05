'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import SessionForm from '@/components/sessions/SessionForm';
import SummaryForm from '@/components/summaries/SummaryForm';
import RecordingModal from '@/components/recordings/RecordingModal';
import { sessionStatusLabels } from '@/lib/labels';
import type { Session, SessionSummary } from '@/types';
import { fmtDate, fmtHebrewDate } from '@/lib/dateUtils';

// A session is "pending summary" if it's in the past and still 'planned'
function effectiveStatus(s: Session): string {
  if (s.status !== 'planned') return s.status;
  const end = new Date(`${s.date}T${s.end_time || '23:59'}`);
  return end < new Date() ? 'pending_summary' : 'planned';
}

export default function SessionsPage() {
  const [records,         setRecords]         = useState<Session[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [editOpen,        setEditOpen]        = useState(false);
  const [editing,         setEditing]         = useState<Session | null>(null);
  const [summaryOpen,     setSummaryOpen]     = useState(false);
  const [summarySession,  setSummarySession]  = useState<Session | null>(null);
  const [recordingOpen,   setRecordingOpen]   = useState(false);
  const [recordingSession,setRecordingSession]= useState<Session | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('sessions')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as Session[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק פגישה זו?')) return;
    await supabase.from('sessions').delete().eq('id', id);
    load();
  }

  function openSummary(s: Session) { setSummarySession(s); setSummaryOpen(true); }
  function openRecording(s: Session) { setRecordingSession(s); setRecordingOpen(true); }

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-8">
      <PageHeader title="יומן פגישות" description="תיאום ומעקב פגישות"
        buttonLabel="פגישה חדשה" onAdd={() => { setEditing(null); setEditOpen(true); }} />

      {loading ? (
        <p className="text-center py-12 text-slate-400">טוען...</p>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-14 text-center text-slate-400">
          לא נמצאו פגישות. לחצי על <strong className="text-slate-600">+ פגישה חדשה</strong> להוספה.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(r => {
            const status      = effectiveStatus(r);
            const isPending   = status === 'pending_summary';
            const patientName = (r.patient as any)?.full_name as string | undefined;

            return (
              <div
                key={r.id}
                className={`bg-white rounded-xl border transition-colors ${
                  isPending ? 'border-orange-200' : 'border-slate-200'
                }`}
              >
                {/* ── Card header ─────────────────────────── */}
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    {/* Left: patient + time */}
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-base font-semibold text-slate-800">
                          {patientName ?? '—'}
                        </span>
                        <Badge value={status} labels={sessionStatusLabels} />
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-0.5">
                            ⚠ חסר סיכום
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-slate-500">
                        <span>{r.start_time} – {r.end_time}</span>
                        {r.duration_minutes && <span>{r.duration_minutes} דק׳</span>}
                      </div>
                    </div>

                    {/* Right: date */}
                    <div className="text-left shrink-0">
                      <div className="text-sm font-semibold text-slate-700">{fmtDate(r.date)}</div>
                      <div className="text-xs text-slate-400 mt-0.5">{fmtHebrewDate(r.date)}</div>
                    </div>
                  </div>

                  {r.notes && (
                    <p className="mt-2 text-xs text-slate-400 line-clamp-1">{r.notes}</p>
                  )}
                </div>

                {/* ── Actions ─────────────────────────────── */}
                <div className="px-5 py-2.5 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                  {/* Primary: create summary (highlighted when pending) */}
                  {status !== 'completed' && status !== 'cancelled' && (
                    <button
                      onClick={() => openSummary(r)}
                      className={`text-xs font-medium rounded-lg px-3 py-1.5 transition-colors ${
                        isPending
                          ? 'bg-orange-100 text-orange-800 hover:bg-orange-200 border border-orange-200'
                          : 'text-teal-700 border border-teal-200 hover:bg-teal-50'
                      }`}>
                      + סיכום פגישה
                    </button>
                  )}
                  <button
                    onClick={() => openRecording(r)}
                    className="text-xs font-medium text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors">
                    🎙️ הקלטה
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => { setEditing(r); setEditOpen(true); }}
                    className="text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1">
                    ערוך
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    className="text-xs text-red-400 hover:text-red-600 transition-colors px-2 py-1">
                    מחק
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Edit/Add session modal ───────────────────────── */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={editing ? 'עריכת פגישה' : 'פגישה חדשה'}>
        <SessionForm initial={editing} onSave={() => { setEditOpen(false); load(); }} onCancel={() => setEditOpen(false)} />
      </Modal>

      {/* ── Summary modal ───────────────────────────────── */}
      <Modal
        open={summaryOpen}
        onClose={() => setSummaryOpen(false)}
        title={summarySession ? `סיכום פגישה — ${fmtDate(summarySession.date)}` : 'הוספת סיכום'}
        size="xl"
      >
        {summarySession && (
          <SummaryForm
            initial={summaryInitialFor(summarySession)}
            fixedPatient={{
              id: summarySession.patient_id,
              name: (summarySession.patient as any)?.full_name ?? '',
            }}
            onSave={() => { setSummaryOpen(false); load(); }}
            onCancel={() => setSummaryOpen(false)}
          />
        )}
      </Modal>

      {/* ── Recording modal ─────────────────────────────── */}
      <Modal open={recordingOpen} onClose={() => setRecordingOpen(false)} title="הקלטת פגישה" size="md">
        {recordingSession && (
          <RecordingModal
            patientId={recordingSession.patient_id}
            onSave={() => setRecordingOpen(false)}
            onCancel={() => setRecordingOpen(false)}
          />
        )}
      </Modal>
    </div>
  );
}

function summaryInitialFor(s: Session): SessionSummary {
  return { patient_id: s.patient_id, session_id: s.id } as unknown as SessionSummary;
}
