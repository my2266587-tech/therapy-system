'use client';

/**
 * סיכומים טלפוניים ממתינים לאישור
 *
 *   Lists every phone_summary_drafts row, lets the clinician fill in
 *   missing patient links + content fields, and approves a draft into
 *   a real session_summaries row.
 *
 *   This is CRM-side only — no Yemot Mashiach integration yet. The
 *   "צור טיוטה לדוגמה" button at the top creates a synthetic draft
 *   that exercises the same backend the future webhook will hit.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import { Field, SelectField } from '@/components/ui/FormField';
import DictatedTextarea from '@/components/ui/DictatedTextarea';
import type { PhoneSummaryDraft } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

type FilterKey = 'pending' | 'all' | 'draft_ready' | 'needs_match' | 'failed' | 'approved';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'pending',     label: 'ממתינים לאישור' },
  { key: 'draft_ready', label: 'מוכן לאישור' },
  { key: 'needs_match', label: 'צריך שיוך מטופלת' },
  { key: 'failed',      label: 'נכשל' },
  { key: 'approved',    label: 'אושרו' },
  { key: 'all',         label: 'הכל' },
];

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  draft_ready: { label: 'מוכן לאישור',        bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4' },
  needs_match: { label: 'צריך שיוך מטופלת',   bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  failed:      { label: 'נכשל',                bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  approved:    { label: 'אושר',                bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
};

const MATCH_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  matched:    { label: 'משויך',     bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4' },
  ambiguous:  { label: 'אי־ודאות',  bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
  not_found:  { label: 'לא נמצא',   bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
};

type PatientOpt = { id: string; full_name: string };

export default function PhonePendingPage() {
  const [drafts, setDrafts]     = useState<PhoneSummaryDraft[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [filter, setFilter]     = useState<FilterKey>('pending');
  const [editing, setEditing]   = useState<PhoneSummaryDraft | null>(null);
  const [patients, setPatients] = useState<PatientOpt[]>([]);

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) { setError('יש להתחבר מחדש'); setLoading(false); return; }
      // Server-side status filter for everything except the "ממתינים"
      // pseudo-status which is the union of two real statuses — filtered
      // client-side below.
      const qs = filter === 'all' || filter === 'pending'
        ? ''
        : `?status=${filter}`;
      const res = await fetch(`/api/admin/phone-drafts${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `שגיאה (${res.status})`);
      }
      const j = await res.json();
      setDrafts((j?.drafts ?? []) as PhoneSummaryDraft[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filter, getToken]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    supabase.from('patients').select('id, full_name').order('full_name')
      .then(({ data }) => setPatients((data ?? []) as PatientOpt[]));
  }, []);

  const filteredDrafts = useMemo(() => {
    if (filter !== 'pending') return drafts;
    return drafts.filter(d => d.status === 'draft_ready' || d.status === 'needs_match');
  }, [drafts, filter]);

  async function createSampleDraft() {
    setError(null);
    const token = await getToken();
    if (!token) { setError('יש להתחבר מחדש'); return; }
    // Pick a random patient name from the loaded list (1/3 chance of
    // an unmatchable name to demo the needs_match flow).
    const randomReal = patients[Math.floor(Math.random() * Math.max(patients.length, 1))];
    const useReal = patients.length > 0 && Math.random() > 0.33;
    const sample = {
      spoken_patient_name: useReal && randomReal
        ? randomReal.full_name
        : 'דוגמה ללא התאמה',
      current_state:     'הגיעה רגועה, בהמשך לפגישה הקודמת.',
      main_topics:       'דיברנו על המתח מול אמא, על האמירות בסוף שבוע.',
      treatment_actions: 'תרגלנו טכניקת נשימה. עברנו על דיאלוג עם אמא.',
      next_steps:        'להמשיך עם תרגול הנשימה היומי. לקבוע פגישה משולשת.',
      tasks_given:       'לכתוב כל יום שלוש שורות תודה.',
      progress:          'יש שיפור ניכר בשליטה עצמית.',
      difficulties:      'עדיין מתקשה לבקש עזרה.',
      notes:             'נשלח מהדגמת ה-CRM, לא הקלטה אמיתית.',
      call_date:         new Date().toISOString().slice(0, 10),
      call_start_time:   '14:00',
      call_end_time:     '14:35',
      source_transcript: '[דוגמה מקומית — לא תמלול אמיתי]',
    };
    try {
      const res = await fetch('/api/admin/phone-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(sample),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `שגיאה (${res.status})`);
      }
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const pendingCount = useMemo(
    () => drafts.filter(d => d.status === 'draft_ready' || d.status === 'needs_match').length,
    [drafts],
  );

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              סיכומים טלפוניים ממתינים לאישור
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              טיוטות שמגיעות מהזרימה הטלפונית. אישור ושמירה יוצר סיכום אמיתי בתיק המטופלת.
            </p>
          </div>
          <button
            onClick={createSampleDraft}
            style={{
              padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              color: C.sub, backgroundColor: C.card, border: `1px dashed ${C.border}`,
              cursor: 'pointer',
            }}
            title="ייצור טיוטה מקומית לצורך בדיקה — לא קשורה לטלפון אמיתי"
          >
            + צור טיוטה לדוגמה
          </button>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 16, flexWrap: 'wrap' }}>
          {FILTERS.map(f => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '6px 14px', borderRadius: 18, fontSize: 12.5,
                  fontWeight: active ? 600 : 500,
                  color: active ? '#FFFFFF' : C.sub,
                  backgroundColor: active ? C.accent : C.card,
                  border: `1px solid ${active ? C.accent : C.border}`,
                  cursor: 'pointer', transition: 'all 0.12s',
                  boxShadow: active ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
                }}
              >
                {f.label}
                {f.key === 'pending' && pendingCount > 0 && (
                  <span style={{
                    marginInlineStart: 6, padding: '1px 7px',
                    borderRadius: 10, fontSize: 11, fontWeight: 700,
                    backgroundColor: active ? 'rgba(255,255,255,0.22)' : '#FEF2F2',
                    color: active ? '#FFFFFF' : '#DC2626',
                  }}>
                    {pendingCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {error && (
          <div style={{
            padding: '11px 14px', borderRadius: 9, marginBottom: 12,
            backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
            color: '#B91C1C', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : filteredDrafts.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 14, overflow: 'hidden',
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
          }}>
            {filteredDrafts.map((d, i) => {
              const stStyle = STATUS_STYLE[d.status] ?? STATUS_STYLE.draft_ready;
              const matchStyle = MATCH_STYLE[d.match_status] ?? MATCH_STYLE.not_found;
              const matchedName = (d.matched_patient as { full_name?: string } | null | undefined)?.full_name;
              const isApproved  = d.status === 'approved';
              return (
                <div
                  key={d.id}
                  onClick={() => !isApproved && setEditing(d)}
                  style={{
                    padding: '14px 22px',
                    borderBottom: i < filteredDrafts.length - 1 ? '1px solid #F1F5F9' : 'none',
                    display: 'flex', alignItems: 'center', gap: 14,
                    cursor: isApproved ? 'default' : 'pointer',
                    backgroundColor: isApproved ? '#FAFCFB' : C.card,
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={e => { if (!isApproved) (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                  onMouseLeave={e => { if (!isApproved) (e.currentTarget as HTMLElement).style.backgroundColor = C.card; }}
                >
                  {/* Spoken name + matched */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                      {d.spoken_patient_name || <span style={{ color: C.muted }}>(ללא שם)</span>}
                      {matchedName && matchedName !== d.spoken_patient_name && (
                        <span style={{ color: C.muted, fontWeight: 400, fontSize: 12, marginInlineStart: 8 }}>
                          ↦ {matchedName}
                        </span>
                      )}
                    </p>
                    <p style={{ fontSize: 11.5, color: C.muted, margin: '3px 0 0' }}>
                      {new Date(d.created_at).toLocaleString('he-IL', {
                        day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                      })}
                      {d.call_date && ` · שיחה ב-${d.call_date.slice(8,10)}.${d.call_date.slice(5,7)}`}
                    </p>
                  </div>

                  {/* Match status chip */}
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    padding: '3px 9px', borderRadius: 14,
                    backgroundColor: matchStyle.bg, color: matchStyle.text,
                    border: `1px solid ${matchStyle.border}`,
                    flexShrink: 0,
                  }}>
                    {matchStyle.label}
                  </span>

                  {/* Overall status chip */}
                  <span style={{
                    fontSize: 11.5, fontWeight: 600,
                    padding: '3px 11px', borderRadius: 14,
                    backgroundColor: stStyle.bg, color: stStyle.text,
                    border: `1px solid ${stStyle.border}`,
                    flexShrink: 0,
                  }}>
                    {stStyle.label}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="עריכת טיוטה טלפונית"
        size="2xl"
      >
        {editing && (
          <DraftEditor
            initial={editing}
            patients={patients}
            getToken={getToken}
            onSaved={() => { setEditing(null); reload(); }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── Draft editor ─────────────────────────────────────────────────── */

function DraftEditor({
  initial, patients, getToken, onSaved, onCancel,
}: {
  initial:  PhoneSummaryDraft;
  patients: PatientOpt[];
  getToken: () => Promise<string | null>;
  onSaved:  () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    matched_patient_id: initial.matched_patient_id ?? '',
    current_state:      initial.current_state      ?? '',
    main_topics:        initial.main_topics        ?? '',
    treatment_actions:  initial.treatment_actions  ?? '',
    next_steps:         initial.next_steps         ?? '',
    tasks_given:        initial.tasks_given        ?? '',
    progress:           initial.progress           ?? '',
    difficulties:       initial.difficulties       ?? '',
    notes:              initial.notes              ?? '',
    call_date:          initial.call_date          ?? '',
    call_start_time:    initial.call_start_time    ?? '',
    call_end_time:      initial.call_end_time      ?? '',
  });
  const [busy,  setBusy]  = useState<'idle' | 'saving' | 'approving' | 'deleting'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: typeof form[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function save() {
    setBusy('saving'); setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('יש להתחבר מחדש');
      const payload = {
        matched_patient_id: form.matched_patient_id || null,
        current_state:      form.current_state || null,
        main_topics:        form.main_topics || null,
        treatment_actions:  form.treatment_actions || null,
        next_steps:         form.next_steps || null,
        tasks_given:        form.tasks_given || null,
        progress:           form.progress || null,
        difficulties:       form.difficulties || null,
        notes:              form.notes || null,
        call_date:          form.call_date || null,
        call_start_time:    form.call_start_time || null,
        call_end_time:      form.call_end_time || null,
      };
      const res = await fetch(`/api/admin/phone-drafts/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `שגיאה (${res.status})`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('idle');
    }
  }

  async function approve() {
    if (!form.matched_patient_id) {
      setError('יש לבחור מטופלת לפני אישור.');
      return;
    }
    setBusy('approving'); setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('יש להתחבר מחדש');
      // Save edits first so the approved row reflects the latest state.
      const saveRes = await fetch(`/api/admin/phone-drafts/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          matched_patient_id: form.matched_patient_id || null,
          current_state:      form.current_state || null,
          main_topics:        form.main_topics || null,
          treatment_actions:  form.treatment_actions || null,
          next_steps:         form.next_steps || null,
          tasks_given:        form.tasks_given || null,
          progress:           form.progress || null,
          difficulties:       form.difficulties || null,
          notes:              form.notes || null,
          call_date:          form.call_date || null,
          call_start_time:    form.call_start_time || null,
          call_end_time:      form.call_end_time || null,
        }),
      });
      if (!saveRes.ok) {
        const j = await saveRes.json().catch(() => null);
        throw new Error(j?.error ?? `שגיאה בשמירה (${saveRes.status})`);
      }
      // Approve.
      const apvRes = await fetch(`/api/admin/phone-drafts/${initial.id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!apvRes.ok) {
        const j = await apvRes.json().catch(() => null);
        throw new Error(j?.error ?? `שגיאה באישור (${apvRes.status})`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('idle');
    }
  }

  async function remove() {
    setBusy('deleting'); setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('יש להתחבר מחדש');
      const res = await fetch(`/api/admin/phone-drafts/${initial.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? `שגיאה (${res.status})`);
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setBusy('idle');
      setConfirmDelete(false);
    }
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 9,
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
          color: '#B91C1C', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Spoken-name reminder (read-only context) */}
      <div style={{
        padding: '10px 14px', borderRadius: 9,
        backgroundColor: '#F8FAFC', border: '1px solid #E8ECF0',
        fontSize: 12.5, color: '#475569',
      }}>
        <span style={{ fontWeight: 600 }}>שם שנאמר בטלפון: </span>
        {initial.spoken_patient_name || '(לא נמסר)'}
      </div>

      {/* Patient + call metadata */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <SelectField
          label="מטופלת *"
          value={form.matched_patient_id}
          onChange={v => set('matched_patient_id', v)}
          options={patientOptions}
          placeholder="בחרי מטופלת..."
        />
        <Field label="תאריך שיחה" type="date" value={form.call_date} onChange={v => set('call_date', v)} />
        <Field label="משעה" type="time" value={form.call_start_time} onChange={v => set('call_start_time', v)} />
        <Field label="עד שעה" type="time" value={form.call_end_time} onChange={v => set('call_end_time', v)} />
      </div>

      {/* Content */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <DictatedTextarea label="מצב נוכחי" value={form.current_state} onChange={v => set('current_state', v)} rows={2} />
        <DictatedTextarea label="נושאים חשובים שעלו" value={form.main_topics} onChange={v => set('main_topics', v)} rows={2} />
        <DictatedTextarea label="מה עשינו בטיפול" value={form.treatment_actions} onChange={v => set('treatment_actions', v)} rows={2} />
        <DictatedTextarea label="עם מה מתחילים בפגישה הבאה" value={form.next_steps} onChange={v => set('next_steps', v)} rows={2} />
        <DictatedTextarea label="משימות שקיבלה" value={form.tasks_given} onChange={v => set('tasks_given', v)} rows={2} />
        <DictatedTextarea label="התקדמות" value={form.progress} onChange={v => set('progress', v)} rows={2} />
        <DictatedTextarea label="קושי בהתקדמות" value={form.difficulties} onChange={v => set('difficulties', v)} rows={2} />
        <DictatedTextarea label="הערות נוספות" value={form.notes} onChange={v => set('notes', v)} rows={2} />
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex', gap: 10, alignItems: 'center',
        paddingTop: 14, borderTop: '1px solid #E8ECF0',
      }}>
        <button
          onClick={approve}
          disabled={busy !== 'idle' || !form.matched_patient_id}
          style={{
            padding: '10px 20px', borderRadius: 9, fontSize: 14, fontWeight: 600,
            backgroundColor: form.matched_patient_id ? '#0D9488' : '#CBD5E1',
            color: '#FFFFFF', border: 'none',
            cursor: busy !== 'idle' || !form.matched_patient_id ? 'not-allowed' : 'pointer',
            boxShadow: form.matched_patient_id ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
          }}
          title={!form.matched_patient_id ? 'בחרי מטופלת כדי לאשר' : ''}
        >
          {busy === 'approving' ? 'מאשר...' : '✓ אישור ושמירה'}
        </button>
        <button
          onClick={save}
          disabled={busy !== 'idle'}
          style={{
            padding: '10px 18px', borderRadius: 9, fontSize: 14, fontWeight: 500,
            backgroundColor: '#FFFFFF', color: '#475569',
            border: '1px solid #E8ECF0',
            cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
          }}
        >
          {busy === 'saving' ? 'שומר...' : 'שמירת טיוטה'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy !== 'idle'}
          style={{
            padding: '10px 18px', borderRadius: 9, fontSize: 14, fontWeight: 500,
            backgroundColor: 'transparent', color: '#64748B',
            border: 'none', cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
            marginInlineStart: 'auto',
          }}
        >
          ביטול
        </button>

        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12.5, color: '#B91C1C', fontWeight: 600 }}>למחוק לצמיתות?</span>
            <button
              onClick={remove}
              disabled={busy !== 'idle'}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                backgroundColor: '#DC2626', color: '#FFFFFF', border: 'none',
                cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
              }}
            >
              {busy === 'deleting' ? 'מוחק...' : 'כן, מחק'}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              disabled={busy !== 'idle'}
              style={{
                padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                backgroundColor: '#FFFFFF', color: '#64748B', border: '1px solid #E8ECF0',
                cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
              }}
            >
              לא
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={busy !== 'idle'}
            style={{
              padding: '10px 16px', borderRadius: 9, fontSize: 14, fontWeight: 500,
              backgroundColor: '#FFFFFF', color: '#DC2626',
              border: '1px solid #FECACA',
              cursor: busy !== 'idle' ? 'not-allowed' : 'pointer',
            }}
            title="מחיקת הטיוטה לצמיתות"
          >
            מחיקה
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Skeleton + empty ─────────────────────────────────────────────── */

function ListSkeleton() {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${C.border}`, overflow: 'hidden',
    }}>
      {[1, 2, 3].map((i, idx) => (
        <div key={i} style={{
          padding: '14px 22px', display: 'flex', alignItems: 'center', gap: 14,
          borderBottom: idx < 2 ? '1px solid #F1F5F9' : 'none',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, width: '30%', backgroundColor: '#F1F5F9', borderRadius: 6, marginBottom: 7 }} />
            <div style={{ height: 10, width: '20%', backgroundColor: '#F8FAFC', borderRadius: 6 }} />
          </div>
          <div style={{ height: 18, width: 65, backgroundColor: '#F1F5F9', borderRadius: 14 }} />
          <div style={{ height: 18, width: 90, backgroundColor: '#F1F5F9', borderRadius: 14 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px dashed ${C.border}`, padding: '52px 24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>
        אין טיוטות בהמתנה
      </p>
      <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
        אחרי שיגיעו סיכומים טלפוניים מימות משיח, הם יופיעו כאן.
      </p>
    </div>
  );
}
