'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import SummaryForm from '@/components/summaries/SummaryForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import DateDisplay from '@/components/ui/DateDisplay';
import SummaryDetailCard from '@/components/summaries/SummaryDetailCard';
import SearchBar, { SearchEmpty } from '@/components/ui/SearchBar';
import type { SessionSummary } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

interface SummaryWithRel extends SessionSummary {
  patient: { full_name: string } | null;
}

const SUMMARY_EXPORT_COLUMNS: Column<SummaryWithRel>[] = [
  { header: 'תאריך',           accessor: r => r.date, width: 14 },
  { header: 'מטופלת',          accessor: r => r.patient?.full_name ?? '', width: 22 },
  { header: 'התחלה',           accessor: r => r.start_time ?? '', width: 10 },
  { header: 'סיום',            accessor: r => r.end_time ?? '', width: 10 },
  { header: 'משך (דק׳)',       accessor: r => r.duration_minutes ?? '', width: 12 },
  { header: 'נושאים עיקריים', accessor: r => r.main_topics ?? '', width: 30 },
  { header: 'מה נעשה',         accessor: r => r.treatment_actions ?? '', width: 30 },
  { header: 'התקדמות',         accessor: r => r.progress ?? '', width: 22 },
  { header: 'צעדים הבאים',    accessor: r => r.next_steps ?? '', width: 22 },
  { header: 'הערות',           accessor: r => r.notes ?? '', width: 24 },
];

/* RecordingWidget moved to components/recordings/RecordingWidget.tsx and
 * lives only on /recordings now — the recording flow is no longer mixed
 * with summaries (recording → transcribe → AI draft → approve → summary). */

/* ── Main page ── */

export default function SummariesPage() {
  const [records, setRecords] = useState<SummaryWithRel[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [open,       setOpen]       = useState(false);
  const [editing,    setEditing]    = useState<SessionSummary | null>(null);
  const [openDetail, setOpenDetail] = useState<SummaryWithRel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('session_summaries')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    let rows = (data ?? []) as unknown as SummaryWithRel[];

    // Resolve fresh signed URLs for any uploaded attachments. We do this in
    // one batch call so a page with 50 summaries doesn't fan out into 50
    // signed-URL requests.
    const paths = rows.map(r => r.attachment_path).filter((p): p is string => !!p);
    if (paths.length > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch('/api/summaries/sign-attachments', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths }),
          });
          if (res.ok) {
            const json = await res.json() as { urls: Record<string, string> };
            rows = rows.map(r =>
              r.attachment_path && json.urls[r.attachment_path]
                ? { ...r, attachment_url: json.urls[r.attachment_path] }
                : r
            );
          }
        }
      } catch {
        // Non-fatal: rows render fine without the link.
      }
    }

    setRecords(rows);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק סיכום זה?')) return;
    await supabase.from('session_summaries').delete().eq('id', id);
    load();
  }

  function handleSummaryChange(updated: SessionSummary) {
    setRecords(rows => rows.map(row =>
      row.id === updated.id ? { ...row, ...updated, patient: row.patient } : row
    ));
    setOpenDetail(current =>
      current?.id === updated.id ? { ...current, ...updated, patient: current.patient } : current
    );
  }

  // Free-text search across patient name, date and every text field of the
  // summary, so a single box finds a summary by who/when/what.
  const q = search.trim().toLowerCase();
  const filtered = q === '' ? records : records.filter(r => {
    const haystack = [
      r.patient?.full_name, r.date, r.start_time, r.end_time,
      r.main_topics, r.treatment_actions, r.progress, r.next_steps, r.notes,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              סיכומי פגישות
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${filtered.length} סיכומים${search.trim() && filtered.length !== records.length ? ` מתוך ${records.length}` : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<SummaryWithRel>
              rows={filtered}
              columns={SUMMARY_EXPORT_COLUMNS}
              title="סיכומי פגישות"
              fileBase="session-summaries"
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
              + הוסף סיכום
            </button>
          </div>
        </div>

        {/* Free-text search */}
        {!loading && records.length > 0 && (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="חיפוש חופשי — שם, תאריך, נושא, הערות..."
          />
        )}

        {/* Summaries list */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : filtered.length === 0 ? (
          <SearchEmpty query={search} onClear={() => setSearch('')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(r => {
              const preview = r.main_topics ?? r.treatment_actions ?? r.progress ?? r.notes ?? '';
              return (
                <div
                  key={r.id}
                  onClick={() => setOpenDetail(r)}
                  style={{
                    backgroundColor: C.card, borderRadius: 12,
                    border: `1px solid ${C.border}`, boxShadow: C.shadow,
                    borderRight: `3px solid ${C.accent}`,
                    padding: '14px 18px', cursor: 'pointer',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = C.accentRim;
                    e.currentTarget.style.borderRightColor = C.accent;
                    e.currentTarget.style.boxShadow = `0 4px 12px rgba(13,148,136,0.08)`;
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = C.border;
                    e.currentTarget.style.borderRightColor = C.accent;
                    e.currentTarget.style.boxShadow = C.shadow;
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    {/* Patient + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                          {r.patient?.full_name ?? '—'}
                        </p>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                        <DateDisplay date={r.date} size="sm" />
                        {r.start_time && (
                          <span style={{
                            fontSize: 11, color: C.muted, fontVariantNumeric: 'tabular-nums',
                            alignSelf: 'center',
                          }}>
                            {r.start_time}{r.end_time ? `–${r.end_time}` : ''}
                            {r.duration_minutes ? ` · ${r.duration_minutes} דק'` : ''}
                          </span>
                        )}
                      </div>
                      {preview && (
                        <p style={{
                          fontSize: 13, color: C.sub, margin: '8px 0 0', lineHeight: 1.5,
                          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}>
                          {preview}
                        </p>
                      )}
                    </div>

                    {/* Open hint */}
                    <span style={{
                      fontSize: 11, fontWeight: 500, color: C.accent,
                      padding: '2px 8px', borderRadius: 12,
                      backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
                      flexShrink: 0, alignSelf: 'flex-start', marginTop: 2,
                    }}>
                      פתח →
                    </span>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 5, flexShrink: 0, alignSelf: 'flex-start' }} onClick={e => e.stopPropagation()}>
                      <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                      <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create/Edit modal */}
      <Modal open={open} onClose={() => setOpen(false)} title={editing?.id ? 'עריכת סיכום' : 'הוספת סיכום'} size="xl">
        <SummaryForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>

      {/* Detail modal — chromeless: SummaryDetailCard owns the chrome */}
      <Modal
        open={openDetail !== null}
        onClose={() => setOpenDetail(null)}
        title="סיכום פגישה"
        size="2xl"
        chromeless
      >
        {openDetail && (
          <SummaryDetailCard
            summary={openDetail}
            patientName={openDetail.patient?.full_name ?? undefined}
            patientHref={openDetail.patient_id ? `/patients/${openDetail.patient_id}` : undefined}
            onSummaryChange={handleSummaryChange}
            onClose={() => setOpenDetail(null)}
            onEdit={() => {
              const s = openDetail;
              setOpenDetail(null);
              setEditing(s);
              setOpen(true);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/* SummaryDetail moved to components/summaries/SummaryDetailCard.tsx —
 * shared with the patient detail page so the same redesigned card
 * serves both views. */

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{
          backgroundColor: C.card, borderRadius: 12,
          border: `1px solid ${C.border}`, padding: '14px 18px',
          borderRight: `3px solid #F1F5F9`,
        }}>
          <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '25%', marginBottom: 8 }} />
          <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '35%', marginBottom: 10 }} />
          <div style={{ height: 11, backgroundColor: '#F1F5F9', borderRadius: 6, width: '90%', marginBottom: 4 }} />
          <div style={{ height: 11, backgroundColor: '#F1F5F9', borderRadius: 6, width: '70%' }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין סיכומים עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת הסיכום הראשון</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף סיכום
      </button>
    </div>
  );
}
