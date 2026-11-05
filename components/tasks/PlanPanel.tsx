'use client';

import { useMemo } from 'react';
import { hebrewDay } from '@/lib/dateUtils';
import type { Task } from '@/types';
import { colors as C } from '@/lib/theme';
import type { CalendarRange } from './TasksCalendar';

/**
 * Collapsible plan bar above the tasks calendar: "what's in my plan" for the
 * exact period the calendar shows (month / week / day), grouped by day, plus
 * overdue open tasks and tasks without a date. Same records and handlers as
 * the calendar, so ticking / editing here updates the grid instantly.
 */

const DAY_LABELS_LONG = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function dayHeader(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `יום ${DAY_LABELS_LONG[dt.getDay()]} ${d}/${m} · ${hebrewDay(dt)}`;
}
const byTime = (a: Task, b: Task) => {
  if (!!a.due_time !== !!b.due_time) return a.due_time ? -1 : 1;
  if (a.due_time && b.due_time && a.due_time !== b.due_time) return a.due_time < b.due_time ? -1 : 1;
  return a.title.localeCompare(b.title, 'he');
};

export default function PlanPanel({ records, range, onEdit, onToggleDone, expanded, onToggleExpanded, onShowAll }: {
  records: Task[];
  range: CalendarRange | null;
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  onShowAll: () => void;
}) {
  const today = localYmd(new Date());

  const { days, open, done, overdue, undated } = useMemo(() => {
    const inRange = range
      ? records.filter(r => r.due_date && r.due_date >= range.from && r.due_date <= range.to)
      : [];
    const map = new Map<string, Task[]>();
    for (const r of inRange) {
      const arr = map.get(r.due_date!) ?? [];
      arr.push(r);
      map.set(r.due_date!, arr);
    }
    const days = Array.from(map.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, tasks]) => ({ date, tasks: tasks.sort(byTime) }));
    return {
      days,
      open: inRange.filter(r => !r.is_done).length,
      done: inRange.filter(r => r.is_done).length,
      // Open tasks left behind before the period on screen.
      overdue: range
        ? records.filter(r => !r.is_done && r.due_date && r.due_date < today && r.due_date < range.from)
            .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
        : [],
      undated: records.filter(r => !r.due_date && !r.is_done),
    };
  }, [records, range, today]);

  const title = range?.view === 'month' ? `התוכנית ל${range.label}`
    : range?.view === 'week' ? 'התוכנית לשבוע' : 'התוכנית ליום';

  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
      boxShadow: C.shadow, overflow: 'hidden', marginBottom: 14,
    }}>
      {/* Header bar — always visible, also when collapsed */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px 14px',
        padding: '10px 16px', backgroundColor: '#F8FAFC',
        borderBottom: expanded ? `1px solid ${C.border}` : 'none',
      }}>
        <button onClick={onToggleExpanded} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'none',
          padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: C.text,
        }}>
          <span style={{ fontSize: 11, color: C.muted }}>{expanded ? '▾' : '◂'}</span>
          {title}
        </button>
        <span style={{ fontSize: 12.5, color: C.muted }}>{open} פתוחות · {done} הושלמו</span>
        {overdue.length > 0 && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#DC2626' }}>{overdue.length} באיחור</span>
        )}
        <span style={{ marginRight: 'auto', display: 'flex', gap: 14 }}>
          <button onClick={onShowAll} style={linkBtn}>לכל המשימות לפי קטגוריות</button>
          <button onClick={onToggleExpanded} style={linkBtn}>{expanded ? 'הסתר רשימה' : 'הצג רשימה'}</button>
        </span>
      </div>

      {/* Body — days spread over columns so it stays short above the calendar */}
      {expanded && (
        <div style={{ maxHeight: 280, overflowY: 'auto', padding: '4px 4px 8px' }}>
          {days.length === 0 && overdue.length === 0 && undated.length === 0 ? (
            <p style={{ padding: '14px', margin: 0, fontSize: 13, color: C.muted, textAlign: 'center' }}>
              אין משימות בתקופה זו
            </p>
          ) : (
            <div style={{ columnWidth: 250, columnGap: 8 }}>
              {overdue.length > 0 && (
                <Section title={`באיחור (${overdue.length})`} color="#DC2626">
                  {overdue.map(t => (
                    <Row key={t.id} task={t} note={fmt(t.due_date!)} noteColor="#DC2626"
                      onEdit={onEdit} onToggle={onToggleDone} />
                  ))}
                </Section>
              )}
              {days.length === 0 && (
                <Section title="בתקופה זו">
                  <p style={{ margin: 0, padding: '2px 14px 6px', fontSize: 12.5, color: C.muted }}>אין משימות</p>
                </Section>
              )}
              {days.map(d => (
                <Section key={d.date} title={dayHeader(d.date)} highlight={d.date === today}>
                  {d.tasks.map(t => (
                    <Row key={t.id} task={t} note={t.due_time ? t.due_time.slice(0, 5) : ''}
                      onEdit={onEdit} onToggle={onToggleDone} />
                  ))}
                </Section>
              ))}
              {undated.length > 0 && (
                <Section title={`ללא תאריך (${undated.length})`}>
                  {undated.map(t => (
                    <Row key={t.id} task={t} note="" onEdit={onEdit} onToggle={onToggleDone} />
                  ))}
                </Section>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = {
  border: 'none', background: 'none', padding: 0, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, color: C.accent,
};

function fmt(iso: string) {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
}

function Section({ title, children, color, highlight }: {
  title: string; children: React.ReactNode; color?: string; highlight?: boolean;
}) {
  return (
    <div style={{ breakInside: 'avoid', marginBottom: 4, borderRadius: 8, border: '1px solid #F1F5F9' }}>
      <div style={{
        padding: '7px 12px 3px', borderRadius: '8px 8px 0 0', fontSize: 11.5, fontWeight: 700,
        color: color ?? (highlight ? C.accent : C.sub),
        backgroundColor: highlight ? C.accentSub : 'transparent',
      }}>
        {title}{highlight ? ' · היום' : ''}
      </div>
      <div style={{ paddingBottom: 4 }}>{children}</div>
    </div>
  );
}

function Row({ task, note, noteColor, onEdit, onToggle }: {
  task: Task; note: string; noteColor?: string;
  onEdit: (t: Task) => void; onToggle: (t: Task) => void;
}) {
  return (
    <div
      onClick={() => onEdit(task)}
      title={task.description ? `${task.title}\n${task.description}` : task.title}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
        cursor: 'pointer', transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => { e.currentTarget.style.backgroundColor = '#F8FAFC'; }}
      onMouseLeave={e => { e.currentTarget.style.backgroundColor = ''; }}
    >
      <button
        onClick={e => { e.stopPropagation(); onToggle(task); }}
        title={task.is_done ? 'סמן כלא הושלם' : 'סמן הושלם'}
        style={{
          width: 16, height: 16, flexShrink: 0, borderRadius: 5, padding: 0, cursor: 'pointer',
          border: `2px solid ${task.is_done ? C.accent : '#CBD5E1'}`,
          backgroundColor: task.is_done ? C.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {task.is_done && (
          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      {note && (
        <span style={{ fontSize: 11, fontWeight: 700, color: noteColor ?? C.accent, flexShrink: 0, minWidth: 32 }}>
          {note}
        </span>
      )}
      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        color: task.is_done ? C.muted : C.text,
        textDecoration: task.is_done ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
    </div>
  );
}
