'use client';

import { useMemo, useState } from 'react';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import { formatGregorian, formatHebrew, hebrewDay, hebrewLong, PRESETS } from '@/lib/dateUtils';
import type { Task } from '@/types';

/**
 * Personal calendar view for the task board ("לוח משימות – אישי").
 * Month / week / day views over tasks that have a due date. Standalone and
 * personal — no sessions, patients or the appointments calendar involved.
 */

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const DAY_LABELS   = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
const MONTH_LABELS = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

type View = 'month' | 'week' | 'day';

/* ── date helpers ── */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return ymd(a) === ymd(b); }
/** "HH:MM" from a "HH:MM:SS" time column value. */
function hm(t: string | null): string { return t ? t.slice(0, 5) : ''; }

interface Props {
  records: Task[];
  loading: boolean;
  /** Add a task/plan on a specific day. */
  onAdd: (date: string) => void;
  onEdit: (t: Task) => void;
  onToggleDone: (t: Task) => void;
  onDelete: (id: string) => void;
}

export default function TasksCalendar({ records, loading, onAdd, onEdit, onToggleDone, onDelete }: Props) {
  const [view,   setView]   = useState<View>('month');
  const [anchor, setAnchor] = useState(new Date());

  /* Only dated tasks can be placed on the calendar. Sorted: timed first
     (by time), then date-only, done items keep their slot. */
  const byDate = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const r of records) {
      if (!r.due_date) continue;
      const arr = m.get(r.due_date) ?? [];
      arr.push(r);
      m.set(r.due_date, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (!!a.due_time !== !!b.due_time) return a.due_time ? -1 : 1;
        if (a.due_time && b.due_time && a.due_time !== b.due_time) return a.due_time < b.due_time ? -1 : 1;
        return a.title.localeCompare(b.title, 'he');
      });
    }
    return m;
  }, [records]);

  const undatedCount = useMemo(() => records.filter(r => !r.due_date && !r.is_done).length, [records]);

  const headerLabel = useMemo<{ greg: string; hebrew: string }>(() => {
    if (view === 'month') {
      return {
        greg:   formatGregorian(anchor, PRESETS.monthYear),
        hebrew: formatHebrew(anchor, PRESETS.monthYear),
      };
    }
    if (view === 'week') {
      const a = startOfWeek(anchor);
      const b = addDays(a, 6);
      const greg = `${a.getDate()} ${MONTH_LABELS[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTH_LABELS[b.getMonth()].slice(0, 3)} ${b.getFullYear()}`;
      return { greg, hebrew: `${formatHebrew(a, PRESETS.monthShort)} – ${formatHebrew(b, PRESETS.monthYear)}` };
    }
    return {
      greg:   formatGregorian(anchor, PRESETS.weekday),
      hebrew: hebrewLong(anchor),
    };
  }, [view, anchor]);

  function nav(dir: 1 | -1 | 0) {
    if (dir === 0) { setAnchor(new Date()); return; }
    const x = new Date(anchor);
    if (view === 'month') x.setMonth(x.getMonth() + dir);
    if (view === 'week')  x.setDate(x.getDate() + 7 * dir);
    if (view === 'day')   x.setDate(x.getDate() + dir);
    setAnchor(x);
  }

  return (
    <div>
      {/* Toolbar */}
      <div style={{
        backgroundColor: C.card, borderRadius: 12,
        border: `1px solid ${C.border}`, boxShadow: C.shadow,
        padding: '12px 16px', marginBottom: 14,
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}>
        {/* Date nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <NavBtn onClick={() => nav(-1)}>‹</NavBtn>
          <button
            onClick={() => nav(0)}
            style={{
              padding: '6px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600,
              border: `1px solid ${C.border}`, backgroundColor: C.card, color: C.sub,
              cursor: 'pointer', transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.accentRim;
              (e.currentTarget as HTMLElement).style.color = C.accent;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.borderColor = C.border;
              (e.currentTarget as HTMLElement).style.color = C.sub;
            }}
          >
            היום
          </button>
          <NavBtn onClick={() => nav(1)}>›</NavBtn>
        </div>

        {/* Header label */}
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.2 }}>
            {headerLabel.greg}
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: C.muted, marginTop: 2 }}>
            {headerLabel.hebrew}
          </div>
        </div>

        {/* View switcher */}
        <div style={{
          display: 'flex', gap: 0, marginRight: 'auto',
          backgroundColor: '#F8FAFC', borderRadius: 8, padding: 3, border: `1px solid ${C.border}`,
        }}>
          {(['month', 'week', 'day'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '6px 14px', borderRadius: 6, fontSize: 13, fontWeight: 600,
                backgroundColor: view === v ? C.card : 'transparent',
                color: view === v ? C.accent : C.sub,
                border: 'none', cursor: 'pointer', transition: 'all 0.1s',
                boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              {v === 'month' ? 'חודש' : v === 'week' ? 'שבוע' : 'יום'}
            </button>
          ))}
        </div>

        {undatedCount > 0 && (
          <span style={{ fontSize: 12, color: C.muted }}>
            {undatedCount} משימות ללא תאריך (מוצגות רק ברשימה)
          </span>
        )}
      </div>

      {/* Calendar body */}
      <div style={{
        backgroundColor: C.card, borderRadius: 14,
        border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
      }}>
        {view === 'month' && (
          <MonthView anchor={anchor} byDate={byDate} loading={loading} onDayClick={onAdd} onTask={onEdit} />
        )}
        {view === 'week' && (
          <WeekView anchor={anchor} byDate={byDate} loading={loading} onDayClick={onAdd} onTask={onEdit} onToggleDone={onToggleDone} />
        )}
        {view === 'day' && (
          <DayView anchor={anchor} byDate={byDate} loading={loading} onAdd={onAdd} onTask={onEdit} onToggleDone={onToggleDone} onDelete={onDelete} />
        )}
      </div>
    </div>
  );
}

/* ── Month view ── */
function MonthView({ anchor, byDate, onDayClick, onTask, loading }: {
  anchor: Date; byDate: Map<string, Task[]>;
  onDayClick: (d: string) => void; onTask: (t: Task) => void; loading: boolean;
}) {
  const cells = useMemo(() => {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const today = new Date();
  const m = anchor.getMonth();

  return (
    <div>
      {/* Day labels */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.border}`, backgroundColor: '#F8FAFC' }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{
            padding: '10px 0', textAlign: 'center',
            fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.04em',
          }}>{d}</div>
        ))}
      </div>
      {/* Cells */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === m;
          const isToday = sameDay(d, today);
          const tasks   = byDate.get(ymd(d)) ?? [];
          const row     = Math.floor(i / 7);
          return (
            <div
              key={i}
              onClick={() => onDayClick(ymd(d))}
              title="הוספת משימה ביום זה"
              style={{
                minHeight: 110, padding: '8px 8px 6px',
                borderBottom: row < 5 ? `1px solid ${C.border}` : 'none',
                borderLeft:   i % 7 < 6 ? `1px solid ${C.border}` : 'none',
                backgroundColor: !inMonth ? '#FAFCFF' : C.card,
                cursor: 'pointer', transition: 'background-color 0.1s',
              }}
              onMouseEnter={e => { if (inMonth) (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = inMonth ? C.card : '#FAFCFF'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 24, height: 24, borderRadius: '50%',
                  fontSize: 12, fontWeight: 600,
                  color: isToday ? '#FFFFFF' : (inMonth ? C.text : C.muted),
                  backgroundColor: isToday ? C.accent : 'transparent',
                }}>
                  {d.getDate()}
                </span>
                <span style={{
                  fontSize: 10, color: inMonth ? C.muted : '#CBD5E1',
                  fontWeight: 500, lineHeight: 1, paddingTop: 6,
                }}>
                  {hebrewDay(d)}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {tasks.slice(0, 3).map(t => (
                  <TaskChip key={t.id} task={t} onClick={e => { e.stopPropagation(); onTask(t); }} />
                ))}
                {tasks.length > 3 && (
                  <div style={{ fontSize: 11, color: C.muted, paddingRight: 4 }}>
                    +{tasks.length - 3} נוספות
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {loading && <Loading />}
    </div>
  );
}

/* ── Week view ── */
function WeekView({ anchor, byDate, onDayClick, onTask, onToggleDone, loading }: {
  anchor: Date; byDate: Map<string, Task[]>;
  onDayClick: (d: string) => void; onTask: (t: Task) => void;
  onToggleDone: (t: Task) => void; loading: boolean;
}) {
  const days = useMemo(() => {
    const start = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [anchor]);
  const today = new Date();

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${C.border}`, backgroundColor: '#F8FAFC' }}>
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          return (
            <div key={i} style={{
              padding: '12px 8px', textAlign: 'center',
              borderLeft: i < 6 ? `1px solid ${C.border}` : 'none',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, marginBottom: 4 }}>
                {DAY_LABELS[d.getDay()]}
              </div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28, borderRadius: '50%',
                fontSize: 14, fontWeight: 600,
                color: isToday ? '#FFFFFF' : C.text,
                backgroundColor: isToday ? C.accent : 'transparent',
              }}>
                {d.getDate()}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 3, fontWeight: 500 }}>
                {hebrewDay(d)}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 540 }}>
        {days.map((d, i) => {
          const tasks = byDate.get(ymd(d)) ?? [];
          return (
            <div
              key={i}
              onClick={() => onDayClick(ymd(d))}
              title="הוספת משימה ביום זה"
              style={{
                padding: 8, borderLeft: i < 6 ? `1px solid ${C.border}` : 'none',
                cursor: 'pointer', transition: 'background-color 0.1s',
                display: 'flex', flexDirection: 'column', gap: 4,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFCFF'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
            >
              {tasks.length === 0 ? (
                <div style={{ fontSize: 11, color: C.muted, padding: 4, opacity: 0.6 }}>—</div>
              ) : tasks.map(t => (
                <TaskCard key={t.id} task={t}
                  onClick={e => { e.stopPropagation(); onTask(t); }}
                  onToggle={e => { e.stopPropagation(); onToggleDone(t); }}
                />
              ))}
            </div>
          );
        })}
      </div>
      {loading && <Loading />}
    </div>
  );
}

/* ── Day view ── */
function DayView({ anchor, byDate, onAdd, onTask, onToggleDone, onDelete, loading }: {
  anchor: Date; byDate: Map<string, Task[]>;
  onAdd: (d: string) => void; onTask: (t: Task) => void;
  onToggleDone: (t: Task) => void; onDelete: (id: string) => void; loading: boolean;
}) {
  const tasks = byDate.get(ymd(anchor)) ?? [];

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 2 }}>
            {DAY_LABELS[anchor.getDay()] === 'ש׳' ? 'שבת' : `יום ${DAY_LABELS[anchor.getDay()]}`}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>
            {formatGregorian(anchor, { day: 'numeric', month: 'long' })}
          </div>
          <div style={{ fontSize: 13, color: C.sub, marginTop: 2, fontWeight: 500 }}>
            {hebrewLong(anchor)}
          </div>
        </div>
        <button
          onClick={() => onAdd(ymd(anchor))}
          style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${C.accentRim}`, backgroundColor: C.accentSub, color: C.accent,
            cursor: 'pointer',
          }}
        >
          + משימה ביום זה
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : tasks.length === 0 ? (
        <div style={{
          padding: '52px 24px', textAlign: 'center',
          borderRadius: 12, backgroundColor: '#F8FAFC', border: `1px dashed ${C.border}`,
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>אין משימות ביום זה</p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>לחצי על הכפתור להוספת משימה או תוכנית</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {tasks.map(t => (
            <TaskCardLarge key={t.id} task={t}
              onClick={() => onTask(t)}
              onToggle={() => onToggleDone(t)}
              onDelete={() => onDelete(t.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small chip (month cells) ── */
function TaskChip({ task, onClick }: { task: Task; onClick: (e: React.MouseEvent) => void }) {
  return (
    <div
      onClick={onClick}
      title={task.title}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 7px', borderRadius: 6, cursor: 'pointer',
        backgroundColor: task.is_done ? '#F4F6F9' : C.accentSub,
        border: `1px solid ${task.is_done ? C.border : C.accentRim}`,
        overflow: 'hidden',
      }}
    >
      {task.is_done ? (
        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: C.accent, flexShrink: 0 }} />
      )}
      {task.due_time && !task.is_done && (
        <span style={{ fontSize: 10.5, fontWeight: 700, color: C.accent, flexShrink: 0 }}>{hm(task.due_time)}</span>
      )}
      <span style={{
        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        color: task.is_done ? C.muted : C.text,
        textDecoration: task.is_done ? 'line-through' : 'none',
      }}>
        {task.title}
      </span>
    </div>
  );
}

/* ── Card (week columns) ── */
function TaskCard({ task, onClick, onToggle }: {
  task: Task; onClick: (e: React.MouseEvent) => void; onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 6,
        padding: '6px 8px', borderRadius: 8, cursor: 'pointer',
        backgroundColor: task.is_done ? '#F4F6F9' : C.accentSub,
        border: `1px solid ${task.is_done ? C.border : C.accentRim}`,
      }}
    >
      <button
        onClick={onToggle}
        title={task.is_done ? 'סמן כלא הושלם' : 'סמן הושלם'}
        style={{
          width: 15, height: 15, marginTop: 1, flexShrink: 0, borderRadius: 5, padding: 0,
          border: `2px solid ${task.is_done ? C.accent : '#CBD5E1'}`,
          backgroundColor: task.is_done ? C.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        {task.is_done && (
          <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>
      <div style={{ minWidth: 0 }}>
        {task.due_time && (
          <div style={{ fontSize: 10.5, fontWeight: 700, color: task.is_done ? C.muted : C.accent }}>
            {hm(task.due_time)}
          </div>
        )}
        <div style={{
          fontSize: 12, fontWeight: 600, lineHeight: 1.3, wordBreak: 'break-word',
          color: task.is_done ? C.muted : C.text,
          textDecoration: task.is_done ? 'line-through' : 'none',
        }}>
          {task.title}
        </div>
      </div>
    </div>
  );
}

/* ── Large card (day view) ── */
function TaskCardLarge({ task, onClick, onToggle, onDelete }: {
  task: Task; onClick: () => void; onToggle: () => void; onDelete: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '13px 16px', borderRadius: 12, cursor: 'pointer',
        backgroundColor: task.is_done ? '#FAFBFD' : C.card,
        border: `1px solid ${task.is_done ? C.border : C.accentRim}`,
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = task.is_done ? '#FAFBFD' : C.card; }}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onToggle(); }}
        title={task.is_done ? 'סמן כלא הושלם' : 'סמן הושלם'}
        style={{
          width: 21, height: 21, marginTop: 1, flexShrink: 0, borderRadius: 7, padding: 0,
          border: `2px solid ${task.is_done ? C.accent : '#CBD5E1'}`,
          backgroundColor: task.is_done ? C.accent : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          transition: 'all 0.12s',
        }}
      >
        {task.is_done && (
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </button>

      {/* Time */}
      <span style={{
        minWidth: 46, textAlign: 'center', flexShrink: 0,
        fontSize: 13, fontWeight: 700, marginTop: 1,
        color: task.is_done ? C.muted : C.accent,
      }}>
        {task.due_time ? hm(task.due_time) : '—'}
      </span>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 600, lineHeight: 1.3,
          color: task.is_done ? C.muted : C.text,
          textDecoration: task.is_done ? 'line-through' : 'none',
        }}>
          {task.title}
        </div>
        {task.description && (
          <p style={{
            fontSize: 13, color: task.is_done ? C.muted : C.sub, margin: '4px 0 0', lineHeight: 1.45,
            textDecoration: task.is_done ? 'line-through' : 'none',
          }}>
            {task.description}
          </p>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <IconBtn onClick={onClick} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
        <IconBtn onClick={onDelete} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
      </div>
    </div>
  );
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 7, fontSize: 16, fontWeight: 600,
        border: `1px solid ${C.border}`, backgroundColor: C.card, color: C.sub,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s', padding: 0,
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLElement).style.borderColor = C.accentRim;
        (e.currentTarget as HTMLElement).style.color = C.accent;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = C.border;
        (e.currentTarget as HTMLElement).style.color = C.sub;
      }}
    >
      {children}
    </button>
  );
}

function Loading() {
  return (
    <div style={{ padding: '18px 24px', textAlign: 'center', fontSize: 13, color: C.muted }}>
      טוען...
    </div>
  );
}
