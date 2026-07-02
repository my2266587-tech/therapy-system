'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import TaskForm from '@/components/tasks/TaskForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import SearchBar, { SearchEmpty } from '@/components/ui/SearchBar';
import { hebrewDay } from '@/lib/dateUtils';
import type { Task } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const PRIORITY = {
  high:   { label: 'גבוהה',  bg: '#FEF2F2', color: '#DC2626', rim: '#FECACA' },
  medium: { label: 'בינונית', bg: '#FFFBEB', color: '#B45309', rim: '#FDE68A' },
  low:    { label: 'נמוכה',  bg: '#F0FDF9', color: '#0D9488', rim: '#99F6E4' },
} as const;

type FilterKey = 'open' | 'done' | 'all';
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'פתוחות' },
  { key: 'done', label: 'הושלמו' },
  { key: 'all',  label: 'הכל' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

export default function TasksPage() {
  const [records, setRecords] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState<FilterKey>('open');
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // Open first, then by due date (undated last), newest created first.
    const { data } = await supabase
      .from('tasks')
      .select('*, patient:patient_id(full_name)')
      .order('is_done', { ascending: true })
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    setRecords((data ?? []) as Task[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleDone(t: Task) {
    // Optimistic flip so the checkbox feels instant.
    const next = !t.is_done;
    setRecords(rs => rs.map(r => r.id === t.id
      ? { ...r, is_done: next, completed_at: next ? new Date().toISOString() : null }
      : r));
    const { error } = await supabase
      .from('tasks')
      .update({ is_done: next, completed_at: next ? new Date().toISOString() : null })
      .eq('id', t.id);
    if (error) { load(); return; }  // revert to server truth on failure
  }

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק משימה זו?')) return;
    await supabase.from('tasks').delete().eq('id', id);
    load();
  }

  const counts = useMemo(() => ({
    open: records.filter(r => !r.is_done).length,
    done: records.filter(r => r.is_done).length,
    all:  records.length,
  }), [records]);

  const byFilter = useMemo(() => {
    if (filter === 'open') return records.filter(r => !r.is_done);
    if (filter === 'done') return records.filter(r => r.is_done);
    return records;
  }, [records, filter]);

  const q = search.trim().toLowerCase();
  const filtered = q === '' ? byFilter : byFilter.filter(r => {
    const haystack = [
      r.title, r.description, r.assignee, PRIORITY[r.priority]?.label,
      (r.patient as { full_name?: string } | null)?.full_name, r.due_date,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              לוח משימות
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${counts.open} פתוחות · ${counts.done} הושלמו`}
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
            + הוסף משימה
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {FILTERS.map(f => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.12s',
                  border: `1px solid ${active ? C.accentRim : C.border}`,
                  backgroundColor: active ? C.accentSub : C.card,
                  color: active ? C.accent : C.sub,
                }}
              >
                {f.label}
                <span style={{ marginInlineStart: 7, fontSize: 12, opacity: 0.75 }}>
                  {counts[f.key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Free-text search */}
        {!loading && records.length > 0 && (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="חיפוש חופשי — כותרת, פירוט, אחראי/ת, מטופלת..."
          />
        )}

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : filtered.length === 0 ? (
          q !== '' ? (
            <SearchEmpty query={search} onClear={() => setSearch('')} />
          ) : (
            <div style={{
              backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`,
              padding: '44px 24px', textAlign: 'center', color: C.muted, fontSize: 14,
            }}>
              {filter === 'open' ? 'אין משימות פתוחות — כל הכבוד! 🎉' : 'אין משימות שהושלמו עדיין'}
            </div>
          )
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
          }}>
            {filtered.map((r, i) => (
              <TaskRow
                key={r.id}
                task={r}
                last={i === filtered.length - 1}
                onToggle={() => toggleDone(r)}
                onEdit={() => { setEditing(r); setOpen(true); }}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת משימה' : 'משימה חדשה'}>
        <TaskForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function TaskRow({ task, last, onToggle, onEdit, onDelete }: {
  task: Task; last: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const pr = PRIORITY[task.priority] ?? PRIORITY.medium;
  const overdue = !task.is_done && task.due_date != null && task.due_date < todayStr();

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 14,
        padding: '15px 24px',
        borderBottom: last ? 'none' : `1px solid #F1F5F9`,
        transition: 'background-color 0.1s',
        opacity: task.is_done ? 0.62 : 1,
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
    >
      {/* Completion checkbox */}
      <button
        onClick={onToggle}
        title={task.is_done ? 'סמן כלא הושלם' : 'סמן הושלם'}
        style={{
          width: 22, height: 22, marginTop: 1, flexShrink: 0,
          borderRadius: 7, cursor: 'pointer',
          border: `2px solid ${task.is_done ? C.accent : '#CBD5E1'}`,
          backgroundColor: task.is_done ? C.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s', padding: 0,
        }}
      >
        {task.is_done && (
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.3,
            textDecoration: task.is_done ? 'line-through' : 'none',
          }}>
            {task.title}
          </span>
          {!task.is_done && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20,
              backgroundColor: pr.bg, color: pr.color, border: `1px solid ${pr.rim}`,
            }}>
              {pr.label}
            </span>
          )}
        </div>

        {task.description && (
          <p style={{ fontSize: 13, color: C.sub, margin: '5px 0 0', lineHeight: 1.45 }}>
            {task.description}
          </p>
        )}

        {/* Meta row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 8 }}>
          {task.due_date && (
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: overdue ? '#DC2626' : C.muted,
              display: 'inline-flex', alignItems: 'center', gap: 5,
            }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              </svg>
              {formatDue(task.due_date)} · {hebrewDay(task.due_date)}
              {overdue && ' · באיחור'}
            </span>
          )}
          {task.assignee && (
            <span style={{ fontSize: 12, color: C.sub, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
              </svg>
              {task.assignee}
            </span>
          )}
          {task.patient_id && task.patient?.full_name && (
            <Link
              href={`/patients/${task.patient_id}`}
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 12, fontWeight: 500, color: C.accent, textDecoration: 'none',
                padding: '2px 9px', borderRadius: 7,
                backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
              }}
            >
              {task.patient.full_name}
            </Link>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
        <IconBtn onClick={onEdit} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
        <IconBtn onClick={onDelete} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
      </div>
    </div>
  );
}

/** "DD/MM" from an ISO date string, locale-safe (no timezone drift). */
function formatDue(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {[1, 2, 3, 4].map((i, idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', borderBottom: idx < 3 ? `1px solid #F1F5F9` : 'none' }}>
          <div style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '35%', marginBottom: 8 }} />
            <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '55%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין משימות עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>הוסיפי את המשימה הראשונה ללוח</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף משימה
      </button>
    </div>
  );
}
