'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import RecordingForm from '@/components/recordings/RecordingForm';
import RecordingWidget from '@/components/recordings/RecordingWidget';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import DateDisplay from '@/components/ui/DateDisplay';
import type { Recording } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const RECORDING_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  pending:      { label: 'ממתין לתמלול', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
  transcribing: { label: 'בתמלול',       bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE', dot: '#1D4ED8' },
  transcribed:  { label: 'תומלל',        bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  draft_ready:  { label: 'נוצר סיכום',   bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE', dot: '#4F46E5' },
  approved:     { label: 'אושר',         bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  failed:       { label: 'שגיאה',        bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', dot: '#DC2626' },
};

const RECORDING_EXPORT_COLUMNS: Column<Recording>[] = [
  { header: 'תאריך הקלטה', accessor: r => r.recorded_at ? new Date(r.recorded_at) : '', width: 16 },
  { header: 'מטופלת',      accessor: r => (r.patient as { full_name?: string } | null)?.full_name ?? '', width: 22 },
  { header: 'תמלול',       accessor: r => r.transcript ? 'כן' : 'לא', width: 10 },
  { header: 'סיכום',       accessor: r => r.draft_summary ? 'כן' : 'לא', width: 10 },
  { header: 'סטטוס',       accessor: r => RECORDING_STATUS[r.status]?.label ?? r.status, width: 16 },
];

export default function RecordingsPage() {
  return (
    <Suspense fallback={null}>
      <RecordingsInner />
    </Suspense>
  );
}

function RecordingsInner() {
  const router = useRouter();
  const sp     = useSearchParams();
  const statusFilter = sp.get('status') ?? 'all';

  const [records, setRecords] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Recording | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('recordings')
      .select('*, patient:patient_id(full_name)')
      .order('recorded_at', { ascending: false });
    setRecords((data ?? []) as Recording[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק הקלטה זו?')) return;
    await supabase.from('recordings').delete().eq('id', id);
    load();
  }

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return records;
    return records.filter(r => r.status === statusFilter);
  }, [records, statusFilter]);

  const STATUS_FILTERS = [
    { value: 'all',          label: 'הכל' },
    { value: 'pending',      label: 'ממתין לתמלול' },
    { value: 'transcribing', label: 'בתמלול' },
    { value: 'transcribed',  label: 'תומלל' },
    { value: 'draft_ready',  label: 'נוצר סיכום' },
    { value: 'approved',     label: 'אושר' },
    { value: 'failed',       label: 'שגיאה' },
  ];

  /* ── create-summary action ──────────────────────────────────────── */
  const router2 = router; // captured for navigation after summary creation
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  async function handleCreateSummary(rec: Recording) {
    if (creatingFor) return;
    setCreatingFor(rec.id);
    setCreateError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) { setCreateError('יש להתחבר מחדש'); setCreatingFor(null); return; }

      const res = await fetch(`/api/recordings/${rec.id}/create-summary`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCreateError(json?.error ?? 'שגיאה ביצירת סיכום');
        setCreatingFor(null);
        return;
      }
      router2.push('/summaries');
    } catch (e) {
      setCreateError(`שגיאת רשת: ${(e as Error).message}`);
    } finally {
      setCreatingFor(null);
    }
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              הקלטות ותמלולים
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${filtered.length} הקלטות${statusFilter !== 'all' ? ' · מסונן' : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<Recording>
              rows={filtered}
              columns={RECORDING_EXPORT_COLUMNS}
              title="הקלטות ותמלולים"
              fileBase="recordings"
              disabled={loading}
            />
            <button
              onClick={() => { setEditing(null); setOpen(true); }}
              style={{
                backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
                borderRadius: 10, padding: '10px 20px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
                boxShadow: `0 2px 8px rgba(13,148,136,0.22)`, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              + הוסף הקלטה
            </button>
          </div>
        </div>

        {/* Recording widget — primary capture entry. The rest of the
            pipeline (upload → transcribe → AI → draft) hooks in later. */}
        <div style={{ marginBottom: 16 }}>
          <RecordingWidget onSaved={() => load()} />
        </div>

        {/* Pipeline note */}
        <div style={{
          backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: 12, padding: '12px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <span style={{ fontSize: 14, color: '#1E40AF', flexShrink: 0, lineHeight: 1.4 }}>ℹ</span>
          <p style={{ fontSize: 13, color: '#1E40AF', margin: 0, lineHeight: 1.55 }}>
            <strong>תהליך:</strong> הקלטה → תמלול → עיבוד AI → טיוטת סיכום → אישור מטפלת → סיכום פגישה.
            כשתופיע הקלטה עם תמלול, יופיע כפתור "צור סיכום פגישה" ליצירת טיוטה.
          </p>
        </div>

        {createError && (
          <div style={{
            padding: '10px 14px', borderRadius: 10, marginBottom: 12,
            backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
            color: '#DC2626', fontSize: 13,
          }}>
            {createError}
          </div>
        )}

        {/* Filter chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          {STATUS_FILTERS.map(f => (
            <FilterChip
              key={f.value}
              label={f.label}
              active={statusFilter === f.value}
              onClick={() => router.push(f.value === 'all' ? '/recordings' : `/recordings?status=${f.value}`)}
            />
          ))}
        </div>

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
            overflow: 'hidden',
          }}>
            {filtered.map((r, i) => {
              const st = RECORDING_STATUS[r.status] ?? RECORDING_STATUS.pending;
              const transcript = r.transcript_text ?? r.transcript ?? null;
              const hasTranscript = !!transcript;
              const canCreateSummary = hasTranscript && !r.summary_id && r.status !== 'draft_ready' && r.status !== 'approved';
              const isBusy = creatingFor === r.id;

              return (
                <div
                  key={r.id}
                  style={{
                    padding: '16px 24px',
                    borderBottom: i < filtered.length - 1 ? `1px solid #F1F5F9` : 'none',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    {/* Recording icon */}
                    <div style={{
                      width: 44, height: 44, borderRadius: 10, flexShrink: 0,
                      backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: C.accent, fontSize: 18,
                    }}>
                      🎙
                    </div>

                    {/* Patient name + date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                        {(r.patient as { full_name?: string } | null)?.full_name ?? '—'}
                      </p>
                      <DateDisplay date={r.recorded_at} size="sm" style={{ marginTop: 4 }} />
                    </div>

                    {/* Duration */}
                    {r.duration_seconds != null && (
                      <span style={{
                        fontSize: 12, color: C.sub, fontVariantNumeric: 'tabular-nums',
                        flexShrink: 0,
                      }}>
                        {Math.floor(r.duration_seconds / 60)}:{String(r.duration_seconds % 60).padStart(2, '0')}
                      </span>
                    )}

                    {/* Status */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
                    }}>
                      <span style={{
                        width: 5, height: 5, borderRadius: '50%',
                        backgroundColor: st.dot, display: 'inline-block',
                        animation: r.status === 'transcribing' ? 'recPulse 1.5s ease-in-out infinite' : undefined,
                      }} />
                      {st.label}
                    </span>

                    {/* Linked summary indicator */}
                    {r.summary_id && (
                      <Link
                        href="/summaries"
                        style={{
                          fontSize: 11.5, fontWeight: 600,
                          color: '#4F46E5', textDecoration: 'none',
                          backgroundColor: '#EEF2FF', border: '1px solid #C7D2FE',
                          padding: '3px 9px', borderRadius: 14, flexShrink: 0,
                        }}
                      >
                        סיכום מקושר ←
                      </Link>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                      <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                      <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                    </div>
                  </div>

                  {/* Transcript preview + create-summary action */}
                  {(hasTranscript || r.processing_error) && (
                    <div style={{
                      marginTop: 12, paddingTop: 12,
                      borderTop: `1px dashed ${C.border}`,
                      display: 'flex', alignItems: 'flex-start', gap: 14,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {hasTranscript && (
                          <>
                            <p style={{
                              fontSize: 11, fontWeight: 600, color: C.muted,
                              margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em',
                            }}>
                              תמלול
                            </p>
                            <p style={{
                              fontSize: 13, color: C.sub, margin: 0,
                              lineHeight: 1.5, display: '-webkit-box',
                              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}>
                              {transcript}
                            </p>
                          </>
                        )}
                        {r.processing_error && (
                          <p style={{
                            fontSize: 12, color: '#DC2626', margin: hasTranscript ? '8px 0 0' : '0',
                          }}>
                            ⚠ {r.processing_error}
                          </p>
                        )}
                      </div>
                      {canCreateSummary && (
                        <button
                          onClick={() => handleCreateSummary(r)}
                          disabled={isBusy}
                          style={{
                            flexShrink: 0,
                            padding: '8px 16px', borderRadius: 9,
                            fontSize: 13, fontWeight: 600,
                            backgroundColor: isBusy ? C.border : C.accent,
                            color: '#FFFFFF', border: 'none',
                            cursor: isBusy ? 'wait' : 'pointer',
                            boxShadow: '0 2px 6px rgba(13,148,136,0.18)',
                          }}
                        >
                          {isBusy ? 'יוצר...' : 'צור סיכום פגישה ←'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <style>{`
              @keyframes recPulse {
                0%,100% { box-shadow: 0 0 0 0 rgba(29,78,216,0.45); }
                50%      { box-shadow: 0 0 0 5px rgba(29,78,216,0); }
              }
            `}</style>
            <div style={{
              padding: '10px 24px', fontSize: 12, color: C.muted,
              backgroundColor: '#F8FAFC', borderTop: `1px solid #F1F5F9`,
            }}>
              {filtered.length} הקלטות
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הקלטה' : 'הוספת הקלטה'}>
        <RecordingForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {[1,2,3,4,5].map((i, idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 24px', borderBottom: idx < 4 ? `1px solid #F1F5F9` : 'none' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '25%', marginBottom: 8 }} />
            <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '18%' }} />
          </div>
          <div style={{ height: 22, width: 80, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 20, fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? '#FFFFFF' : '#64748B',
        backgroundColor: active ? '#0D9488' : '#FFFFFF',
        border: `1px solid ${active ? '#0D9488' : '#E8ECF0'}`,
        cursor: 'pointer', transition: 'all 0.12s',
        boxShadow: active ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = '#99F6E4';
          (e.currentTarget as HTMLElement).style.color = '#0D9488';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = '#E8ECF0';
          (e.currentTarget as HTMLElement).style.color = '#64748B';
        }
      }}
    >
      {label}
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין הקלטות עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת ההקלטה הראשונה</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף הקלטה
      </button>
    </div>
  );
}
