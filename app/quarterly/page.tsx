'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import QuarterlyForm from '@/components/quarterly/QuarterlyForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import DateDisplay from '@/components/ui/DateDisplay';
import type { QuarterlySummary } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

function quarterOf(dateStr: string) {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} ${year}`;
}

export default function QuarterlyPage() {
  const [records, setRecords] = useState<QuarterlySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<QuarterlySummary | null>(null);
  const [openDetail, setOpenDetail] = useState<QuarterlySummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('quarterly_summaries')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as QuarterlySummary[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק סיכום רבעון זה?')) return;
    await supabase.from('quarterly_summaries').delete().eq('id', id);
    load();
  }

  /* KPIs */
  const now = new Date();
  const currentQ = `Q${Math.floor(now.getMonth() / 3) + 1} ${now.getFullYear()}`;
  const thisQuarterCount = records.filter(r => quarterOf(r.date) === currentQ).length;
  const uniquePatients   = new Set(records.map(r => r.patient_id)).size;
  const totalDuration    = records.reduce((s, r) => s + (r.duration_minutes ?? 0), 0);

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              סיכום רבעון
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${records.length} סיכומים`}
            </p>
          </div>
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
            + הוסף סיכום רבעון
          </button>
        </div>

        {/* KPI cards */}
        {records.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            <Kpi label="ברבעון הנוכחי" value={thisQuarterCount} accent />
            <Kpi label="מטופלות מסוכמות" value={uniquePatients} />
            <Kpi label="סה״כ דקות" value={totalDuration.toLocaleString('he-IL')} />
          </div>
        )}

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {records.map(r => (
              <div
                key={r.id}
                onClick={() => setOpenDetail(r)}
                style={{
                  backgroundColor: C.card, borderRadius: 12,
                  border: `1px solid ${C.border}`, boxShadow: C.shadow,
                  padding: '18px 20px', cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = C.accentRim;
                  e.currentTarget.style.boxShadow = `0 4px 12px rgba(13,148,136,0.08)`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = C.border;
                  e.currentTarget.style.boxShadow = C.shadow;
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: r.summary || r.participants ? 12 : 0 }}>
                  {/* Quarter badge */}
                  <div style={{
                    minWidth: 64, textAlign: 'center', flexShrink: 0,
                    backgroundColor: '#F0FDF9', border: `1px solid #99F6E4`,
                    borderRadius: 10, padding: '8px 6px',
                  }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0D9488', margin: 0, lineHeight: 1 }}>
                      {quarterOf(r.date)}
                    </p>
                  </div>

                  {/* Patient + date */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                      {(r.patient as any)?.full_name ?? '—'}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                      <DateDisplay date={r.date} size="sm" />
                      {(r.duration_minutes || r.participants) && (
                        <span style={{ fontSize: 11, color: C.muted, alignSelf: 'center' }}>
                          {r.duration_minutes ? `${r.duration_minutes} דק'` : ''}
                          {r.duration_minutes && r.participants ? ' · ' : ''}
                          {r.participants ?? ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <span style={{
                    fontSize: 11, fontWeight: 500, color: C.accent,
                    padding: '2px 8px', borderRadius: 12,
                    backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
                    flexShrink: 0,
                  }}>
                    פתח →
                  </span>

                  <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>

                {/* Summary preview */}
                {r.summary && (
                  <div style={{
                    borderRadius: 8, padding: '12px 14px',
                    backgroundColor: '#F8FAFC', border: `1px solid ${C.border}`,
                  }}>
                    <p style={{ fontSize: 13, color: C.sub, margin: 0, lineHeight: 1.5 }}>
                      {r.summary.slice(0, 180)}{r.summary.length > 180 ? '…' : ''}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת סיכום רבעון' : 'הוספת סיכום רבעון'}>
        <QuarterlyForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>

      <Modal
        open={openDetail !== null}
        onClose={() => setOpenDetail(null)}
        title="סיכום רבעון"
        size="xl"
      >
        {openDetail && <QuarterlyDetail record={openDetail} />}
      </Modal>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14,
      border: `1px solid ${accent ? C.accentRim : C.border}`,
      boxShadow: accent ? `0 2px 10px rgba(13,148,136,0.08)` : C.shadow,
      padding: '20px 22px',
      borderTop: `2px solid ${accent ? C.accent : 'transparent'}`,
    }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 10px',
        textTransform: 'uppercase', letterSpacing: '0.07em',
      }}>
        {label}
      </p>
      <p style={{
        fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1,
        color: accent ? C.accent : C.text,
      }}>
        {value}
      </p>
    </div>
  );
}

function QuarterlyDetail({ record }: { record: QuarterlySummary }) {
  return (
    <div style={{ direction: 'rtl' }}>
      {/* Meta header */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
        padding: '14px 16px', marginBottom: 18,
        backgroundColor: '#F8FAFC', borderRadius: 10, border: `1px solid ${C.border}`,
      }}>
        <MetaItem label="מטופלת" value={(record.patient as any)?.full_name ?? '—'} />
        <MetaItem label="רבעון" value={quarterOf(record.date)} />
        <MetaItem label="תאריך" value={<DateDisplay date={record.date} size="sm" />} />
        {record.duration_minutes && <MetaItem label="משך" value={`${record.duration_minutes} דק'`} />}
      </div>

      {record.participants && (
        <Section label="משתתפים" value={record.participants} />
      )}
      {record.summary && (
        <Section label="סיכום" value={record.summary} tone="accent" />
      )}
      {record.notes && (
        <Section label="הערות" value={record.notes} />
      )}

      {!record.summary && !record.participants && !record.notes && (
        <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '20px 0' }}>
          אין תוכן בסיכום זה
        </p>
      )}
    </div>
  );
}

function Section({ label, value, tone }: { label: string; value: string; tone?: 'accent' }) {
  return (
    <div style={{
      borderRadius: 10, padding: '14px 16px', marginBottom: 12,
      backgroundColor: tone === 'accent' ? '#F0FDF9' : '#FFFFFF',
      border: `1px solid ${tone === 'accent' ? '#99F6E4' : C.border}`,
    }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: tone === 'accent' ? '#0D9488' : '#94A3B8',
        letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 8,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 14, color: '#1A2332', lineHeight: 1.6, whiteSpace: 'pre-wrap',
      }}>
        {value}
      </div>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2,3,4].map(i => (
        <div key={i} style={{
          backgroundColor: C.card, borderRadius: 12,
          border: `1px solid ${C.border}`, padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
            <div style={{ width: 64, height: 36, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: '30%', marginBottom: 8 }} />
              <div style={{ height: 10, backgroundColor: '#F8FAFC', borderRadius: 6, width: '20%' }} />
            </div>
          </div>
          <div style={{ height: 50, borderRadius: 8, backgroundColor: '#F8FAFC' }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
        backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: C.accent, fontSize: 20,
      }}>
        ◌
      </div>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין סיכומי רבעון עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת הסיכום הראשון</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף סיכום רבעון
      </button>
    </div>
  );
}
