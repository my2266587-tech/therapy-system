'use client';

import { Suspense, useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useSessionsLiveSync } from '@/lib/useSessionsLiveSync';
import Modal from '@/components/ui/Modal';
import SessionForm from '@/components/sessions/SessionForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import DateDisplay from '@/components/ui/DateDisplay';
import SearchBar, { SearchEmpty } from '@/components/ui/SearchBar';
import { hebrewDay } from '@/lib/dateUtils';
import type { Session } from '@/types';

function travelModeLabel(mode: string | null | undefined): string {
  if (mode === 'taxi')  return 'מונית';
  if (mode === 'bus')   return 'אוטובוס';
  if (mode === 'other') return 'אחר';
  return 'נסיעה';
}

const SESSION_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  planned:   { label: 'מתוכננת',  bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  completed: { label: 'הושלמה',   bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  cancelled: { label: 'בוטלה',    bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', dot: '#DC2626' },
  no_show:   { label: 'לא הגיעה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

const SESSION_EXPORT_COLUMNS: Column<Session>[] = [
  { header: 'תאריך',   accessor: r => r.date, width: 14 },
  { header: 'יום',     accessor: r => hebrewDay(r.date), width: 10 },
  { header: 'מטופלת', accessor: r => (r.patient as { full_name?: string } | null)?.full_name ?? '', width: 22 },
  { header: 'התחלה',  accessor: r => r.start_time, width: 10 },
  { header: 'סיום',   accessor: r => r.end_time, width: 10 },
  { header: 'משך (דק׳)', accessor: r => r.duration_minutes ?? '', width: 12 },
  { header: 'סטטוס',  accessor: r => SESSION_STATUS[r.status]?.label ?? r.status, width: 14 },
  { header: 'הערות',  accessor: r => r.notes ?? '', width: 30 },
];

export default function SessionsPage() {
  return (
    <Suspense fallback={null}>
      <SessionsInner />
    </Suspense>
  );
}

function SessionsInner() {
  const router = useRouter();
  const sp     = useSearchParams();
  const filter = sp.get('filter') ?? 'all';

  const [records, setRecords] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Session | null>(null);

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

  // Live-sync: any session change from /calendar, another tab, or the
  // cron triggers a refetch here so the two views never drift.
  useSessionsLiveSync(load);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק פגישה זו?')) return;
    await supabase.from('sessions').delete().eq('id', id);
    load();
  }

  const filtered = useMemo(() => {
    // First narrow by the date chip, then by the free-text query.
    let base = records;
    if (filter === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      base = records.filter(r => r.date === today);
    } else if (filter === 'week') {
      const sun = new Date(); sun.setDate(sun.getDate() - sun.getDay());
      const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
      const a = sun.toISOString().slice(0, 10);
      const b = sat.toISOString().slice(0, 10);
      base = records.filter(r => r.date >= a && r.date <= b);
    }
    const q = search.trim().toLowerCase();
    if (q === '') return base;
    return base.filter(r => {
      const haystack = [
        (r.patient as { full_name?: string } | null)?.full_name, r.date, hebrewDay(r.date),
        r.start_time, r.end_time, SESSION_STATUS[r.status]?.label ?? r.status, r.notes,
      ].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [records, filter, search]);

  const filterLabel = filter === 'today' ? 'היום' : filter === 'week' ? 'השבוע' : null;

  return (
    <div style={{ backgroundColor: '#F6F8FB', minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              יומן פגישות
            </h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {loading ? '' : `${filtered.length} פגישות${filterLabel ? ` · ${filterLabel}` : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<Session>
              rows={filtered}
              columns={SESSION_EXPORT_COLUMNS}
              title="יומן פגישות"
              fileBase="sessions"
              disabled={loading}
            />
            <AddBtn onClick={() => { setEditing(null); setOpen(true); }} label="+ הוסף פגישה" />
          </div>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <FilterChip label="הכל"    active={filter === 'all'}   onClick={() => router.push('/sessions')} />
          <FilterChip label="היום"   active={filter === 'today'} onClick={() => router.push('/sessions?filter=today')} />
          <FilterChip label="השבוע"  active={filter === 'week'}  onClick={() => router.push('/sessions?filter=week')} />
        </div>

        {/* Free-text search */}
        {!loading && records.length > 0 && (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="חיפוש חופשי — מטופלת, תאריך, סטטוס, הערות..."
          />
        )}

        {loading ? <ListSkeleton /> : filtered.length === 0 ? (
          search.trim() !== '' ? (
            <SearchEmpty query={search} onClear={() => setSearch('')} />
          ) : (
            <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} filterLabel={filterLabel} />
          )
        ) : (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: 16,
            border: '1px solid #E8ECF0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            {filtered.map((r, i) => {
              const st = SESSION_STATUS[r.status] ?? SESSION_STATUS.planned;
              return (
                <div
                  key={r.id}
                  onClick={() => { setEditing(r); setOpen(true); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 24px', cursor: 'pointer',
                    borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none',
                    transition: 'background-color 0.1s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  {/* Date badge */}
                  <div style={{
                    minWidth: 54, textAlign: 'center', flexShrink: 0,
                    backgroundColor: '#F6F8FB', border: '1px solid #E8ECF0',
                    borderRadius: 10, padding: '7px 6px',
                  }}>
                    <p style={{ fontSize: 18, fontWeight: 700, color: '#1A2332', margin: 0, lineHeight: 1 }}>
                      {new Date(r.date).getDate()}
                    </p>
                    <p style={{ fontSize: 10, color: '#94A3B8', margin: '2px 0 0', textTransform: 'uppercase' }}>
                      {new Date(r.date).toLocaleDateString('he-IL', { month: 'short' })}
                    </p>
                    <p style={{ fontSize: 9, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>
                      {hebrewDay(r.date)}
                    </p>
                  </div>

                  {/* Patient + time */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 15, fontWeight: 600, color: '#1A2332', margin: 0, lineHeight: 1.3 }}>
                      {(r.patient as any)?.full_name ?? '—'}
                    </p>
                    <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span>
                        {r.start_time} – {r.end_time}
                        {r.duration_minutes ? ` · ${r.duration_minutes} דק'` : ''}
                      </span>
                      {r.is_travel && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                          backgroundColor: '#EEF2FF', color: '#4338CA',
                          border: '1px solid #C7D2FE',
                        }}>
                          🚗 {travelModeLabel(r.travel_mode)}
                          {r.travel_cost != null && ` · ${Number(r.travel_cost).toFixed(2)} ₪`}
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Day label */}
                  <DateDisplay
                    date={r.date}
                    size="sm"
                    smartToday
                    style={{ flexShrink: 0, alignItems: 'flex-end' }}
                  />

                  {/* Status */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: st.dot, display: 'inline-block' }} />
                    {st.label}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor="#0D9488" title="ערוך" />
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>
              );
            })}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: '#94A3B8',
              backgroundColor: '#F8FAFC', borderTop: '1px solid #F1F5F9',
            }}>
              {filtered.length} פגישות{filterLabel ? ` · ${filterLabel}` : ''}
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת פגישה' : 'הוספת פגישה'}>
        <SessionForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
      borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.22)', transition: 'opacity 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >{label}</button>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
      {[1,2,3,4,5].map((i,idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: idx < 4 ? '1px solid #F1F5F9' : 'none' }}>
          <div style={{ width: 54, height: 46, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: '35%', marginBottom: 7 }} />
            <div style={{ height: 10, backgroundColor: '#F8FAFC', borderRadius: 6, width: '22%' }} />
          </div>
          <div style={{ height: 22, width: 65, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd, filterLabel }: { onAdd: () => void; filterLabel: string | null }) {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1A2332', margin: '0 0 6px' }}>
        {filterLabel ? `אין פגישות ${filterLabel}` : 'אין פגישות עדיין'}
      </p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>
        {filterLabel ? 'נסי סינון אחר או הוסיפי פגישה חדשה' : 'התחילי בהוספת הפגישה הראשונה'}
      </p>
      <button onClick={onAdd} style={{ backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        + הוסף פגישה
      </button>
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 16px', borderRadius: 20, fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? '#FFFFFF' : '#64748B',
        backgroundColor: active ? '#0D9488' : '#FFFFFF',
        border: `1px solid ${active ? '#0D9488' : '#E8ECF0'}`,
        cursor: 'pointer', transition: 'all 0.12s',
        boxShadow: active ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
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
