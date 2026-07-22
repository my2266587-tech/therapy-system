'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import TaskForm from '@/components/tasks/TaskForm';
import PersonalPlanForm from '@/components/tasks/PersonalPlanForm';
import TasksCalendar from '@/components/tasks/TasksCalendar';
import { IconBtn, TrashIcon } from '@/components/ui/Icons';
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

const DEFAULT_GROUP = 'כללי';
const todayStr = () => new Date().toISOString().slice(0, 10);
const groupOf = (t: Task) => (t.category?.trim() || DEFAULT_GROUP);

interface Group { name: string; open: Task[]; done: Task[]; }

export default function TasksPage() {
  const [records, setRecords] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [addCategory, setAddCategory] = useState<string | undefined>(undefined);
  // Which groups have their "completed" section expanded.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Board (list) or personal calendar view.
  const [mode, setMode] = useState<'board' | 'calendar'>('board');
  // Personal-plan modal (calendar view): task being edited / pre-filled date.
  const [planOpen, setPlanOpen] = useState(false);
  const [planEditing, setPlanEditing] = useState<Task | null>(null);
  const [planDate, setPlanDate] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select('*, patient:patient_id(full_name)')
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    setRecords((data ?? []) as Task[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleDone(t: Task) {
    const next = !t.is_done;
    setRecords(rs => rs.map(r => r.id === t.id
      ? { ...r, is_done: next, completed_at: next ? new Date().toISOString() : null }
      : r));
    const { error } = await supabase
      .from('tasks')
      .update({ is_done: next, completed_at: next ? new Date().toISOString() : null })
      .eq('id', t.id);
    if (error) load();
  }

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק משימה זו?')) return;
    setRecords(rs => rs.filter(r => r.id !== id));  // optimistic
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) load();
  }

  function openAdd(category?: string) { setEditing(null); setAddCategory(category); setOpen(true); }
  function openEdit(t: Task)          { setEditing(t);   setAddCategory(undefined); setOpen(true); }

  /* Personal calendar view: slim add/edit (title, date + time, notes, status) */
  function openPlanAdd(date?: string) { setPlanEditing(null); setPlanDate(date); setPlanOpen(true); }
  function openPlanEdit(t: Task)      { setPlanEditing(t);    setPlanDate(undefined); setPlanOpen(true); }

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of records) { const c = r.category?.trim(); if (c) set.add(c); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'he'));
  }, [records]);

  const totals = useMemo(() => ({
    open: records.filter(r => !r.is_done).length,
    done: records.filter(r => r.is_done).length,
  }), [records]);

  const q = search.trim().toLowerCase();
  const matches = useCallback((r: Task) => {
    if (q === '') return true;
    return [
      r.title, r.description, r.assignee, groupOf(r), PRIORITY[r.priority]?.label,
      (r.patient as { full_name?: string } | null)?.full_name, r.due_date,
    ].filter(Boolean).join(' ').toLowerCase().includes(q);
  }, [q]);

  // Build the grouped view from the (search-filtered) records.
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, Group>();
    for (const r of records) {
      if (!matches(r)) continue;
      const name = groupOf(r);
      let g = map.get(name);
      if (!g) { g = { name, open: [], done: [] }; map.set(name, g); }
      (r.is_done ? g.done : g.open).push(r);
    }
    // Groups with open work first, then by name. Default group sinks slightly
    // only when it has no open items.
    return Array.from(map.values()).sort((a, b) => {
      const ao = a.open.length > 0 ? 0 : 1;
      const bo = b.open.length > 0 ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name, 'he');
    });
  }, [records, matches]);

  const hasAny = records.length > 0;

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              לוח משימות – אישי
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${totals.open} פתוחות · ${totals.done} הושלמו`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => setMode(m => m === 'board' ? 'calendar' : 'board')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                backgroundColor: mode === 'calendar' ? C.accentSub : C.card,
                color: mode === 'calendar' ? C.accent : C.sub,
                border: `1px solid ${mode === 'calendar' ? C.accentRim : C.border}`,
                borderRadius: 10, padding: '9px 16px', fontSize: 13.5,
                fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.accentRim; el.style.color = C.accent;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                if (mode !== 'calendar') { el.style.borderColor = C.border; el.style.color = C.sub; }
              }}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
              </svg>
              {mode === 'board' ? 'תצוגת לוח שנה' : 'תצוגת רשימה'}
            </button>
            <button
              onClick={() => mode === 'board' ? openAdd() : openPlanAdd()}
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
        </div>

        {/* Free-text search (board view only) */}
        {mode === 'board' && !loading && hasAny && (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="חיפוש חופשי — כותרת, קטגוריה, אחראי/ת, מטופלת..."
          />
        )}

        {/* Content */}
        {mode === 'calendar' ? (
          <TasksCalendar
            records={records}
            loading={loading}
            onAdd={openPlanAdd}
            onEdit={openPlanEdit}
            onToggleDone={toggleDone}
            onDelete={handleDelete}
          />
        ) : loading ? (
          <GroupSkeleton />
        ) : !hasAny ? (
          <EmptyState onAdd={() => openAdd()} />
        ) : groups.length === 0 ? (
          <SearchEmpty query={search} onClear={() => setSearch('')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {groups.map(g => (
              <GroupCard
                key={g.name}
                group={g}
                searching={q !== ''}
                expanded={q !== '' ? true : !!expanded[g.name]}
                onToggleExpand={() => setExpanded(s => ({ ...s, [g.name]: !s[g.name] }))}
                onAdd={() => openAdd(g.name === DEFAULT_GROUP ? undefined : g.name)}
                onToggleDone={toggleDone}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת משימה' : 'משימה חדשה'}>
        <TaskForm
          initial={editing}
          defaultCategory={addCategory}
          categories={categories}
          onSave={() => { setOpen(false); load(); }}
          onCancel={() => setOpen(false)}
        />
      </Modal>

      {/* Personal calendar: slim add/edit modal */}
      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title={planEditing ? 'עריכת משימה' : 'משימה / תוכנית אישית'}>
        <PersonalPlanForm
          initial={planEditing}
          defaultDate={planDate}
          onSave={() => { setPlanOpen(false); load(); }}
          onCancel={() => setPlanOpen(false)}
        />
      </Modal>
    </div>
  );
}

/* ── One category card: title + open items + collapsible completed ── */
function GroupCard({ group, searching, expanded, onToggleExpand, onAdd, onToggleDone, onEdit, onDelete }: {
  group: Group; searching: boolean; expanded: boolean;
  onToggleExpand: () => void; onAdd: () => void;
  onToggleDone: (t: Task) => void; onEdit: (t: Task) => void; onDelete: (id: string) => void;
}) {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 16,
      border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 20px', borderBottom: `1px solid #F1F5F9`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>{group.name}</h2>
          {group.open.length > 0 && (
            <span style={{
              fontSize: 12, fontWeight: 700, color: C.accent,
              backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
              borderRadius: 20, padding: '1px 9px', minWidth: 22, textAlign: 'center',
            }}>
              {group.open.length}
            </span>
          )}
        </div>
        <button
          onClick={onAdd}
          title="הוסף משימה לקטגוריה זו"
          style={{
            border: `1px solid ${C.border}`, backgroundColor: 'transparent',
            color: C.sub, borderRadius: 7, padding: '5px 12px', fontSize: 12.5,
            fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
          }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.backgroundColor = C.accentSub; el.style.borderColor = C.accentRim; el.style.color = C.accent; }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.borderColor = C.border; el.style.color = C.sub; }}
        >
          + הוסף
        </button>
      </div>

      {/* Open items */}
      {group.open.length === 0 ? (
        <p style={{ padding: '16px 20px', fontSize: 13, color: C.muted, margin: 0 }}>
          {searching ? 'אין תוצאות פתוחות' : 'אין משימות פתוחות בקטגוריה זו 🎉'}
        </p>
      ) : (
        <div>
          {group.open.map((t, i) => (
            <TaskRow key={t.id} task={t} last={i === group.open.length - 1}
              onToggle={() => onToggleDone(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} />
          ))}
        </div>
      )}

      {/* Completed (collapsible) */}
      {group.done.length > 0 && (
        <div style={{ borderTop: `1px solid #F1F5F9`, backgroundColor: '#FAFBFD' }}>
          <button
            onClick={onToggleExpand}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '11px 20px', border: 'none', backgroundColor: 'transparent',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, color: C.sub, textAlign: 'right',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {group.done.length} פריטים שהושלמו
          </button>
          {expanded && group.done.map((t, i) => (
            <TaskRow key={t.id} task={t} last={i === group.done.length - 1}
              onToggle={() => onToggleDone(t)} onEdit={() => onEdit(t)} onDelete={() => onDelete(t.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── One task row (used for both open and completed) ── */
function TaskRow({ task, last, onToggle, onEdit, onDelete }: {
  task: Task; last: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const pr = PRIORITY[task.priority] ?? PRIORITY.medium;
  const overdue = !task.is_done && task.due_date != null && task.due_date < todayStr();

  return (
    <div
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '13px 20px',
        borderBottom: last ? 'none' : `1px solid #F1F5F9`,
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = task.is_done ? '#F4F6F9' : '#F8FAFC';
        const a = e.currentTarget.querySelector('[data-actions]') as HTMLElement | null;
        if (a) a.style.opacity = '1';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.backgroundColor = '';
        const a = e.currentTarget.querySelector('[data-actions]') as HTMLElement | null;
        if (a) a.style.opacity = '0';
      }}
      onClick={() => onEdit()}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        title={task.is_done ? 'סמן כלא הושלם' : 'סמן הושלם'}
        style={{
          width: 21, height: 21, marginTop: 1, flexShrink: 0,
          borderRadius: 7, cursor: 'pointer',
          border: `2px solid ${task.is_done ? C.accent : '#CBD5E1'}`,
          backgroundColor: task.is_done ? C.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.12s', padding: 0,
        }}
      >
        {task.is_done && (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 14.5, fontWeight: 600, lineHeight: 1.3,
            color: task.is_done ? C.muted : C.text,
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
          <p style={{
            fontSize: 13, color: task.is_done ? C.muted : C.sub, margin: '4px 0 0', lineHeight: 1.45,
            textDecoration: task.is_done ? 'line-through' : 'none',
          }}>
            {task.description}
          </p>
        )}

        {!task.is_done && (task.due_date || task.assignee || (task.patient_id && task.patient?.full_name)) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 7 }}>
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
        )}
      </div>

      {/* Delete (appears on row hover) */}
      <div data-actions style={{ flexShrink: 0, opacity: 0, transition: 'opacity 0.12s' }}>
        <IconBtn onClick={onDelete} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
      </div>
    </div>
  );
}

/** "DD/MM" from an ISO date string, no timezone drift. */
function formatDue(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}/${m[2]}`;
}

function GroupSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1, 2].map(k => (
        <div key={k} style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: `1px solid #F1F5F9` }}>
            <div style={{ height: 15, width: '30%', backgroundColor: '#F1F5F9', borderRadius: 6 }} />
          </div>
          {[1, 2, 3].map((i, idx) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', borderBottom: idx < 2 ? `1px solid #F1F5F9` : 'none' }}>
              <div style={{ width: 21, height: 21, borderRadius: 7, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: '40%', marginBottom: 8 }} />
                <div style={{ height: 10, backgroundColor: '#F8FAFC', borderRadius: 6, width: '55%' }} />
              </div>
            </div>
          ))}
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
