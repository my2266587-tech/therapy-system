'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSessionsLiveSync } from '@/lib/useSessionsLiveSync';
import Modal from '@/components/ui/Modal';
import SessionForm from '@/components/sessions/SessionForm';
import { formatGregorian, formatHebrew, hebrewDay, hebrewLong, PRESETS } from '@/lib/dateUtils';
import type { Session } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const SESSION_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  planned:   { label: 'מתוכננת',  bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  completed: { label: 'בוצעה',    bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  cancelled: { label: 'בוטלה',    bg: '#FEF2F2', text: '#B91C1C', border: '#FECACA', dot: '#DC2626' },
  no_show:   { label: 'לא הגיעה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

const DAY_LABELS    = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

function travelModeLabel(mode: string | null | undefined): string {
  if (mode === 'taxi')  return 'מונית';
  if (mode === 'bus')   return 'אוטובוס';
  if (mode === 'other') return 'אחר';
  return 'נסיעה';
}
const MONTH_LABELS  = ['ינואר','פברואר','מרץ','אפריל','מאי','יוני','יולי','אוגוסט','ספטמבר','אוקטובר','נובמבר','דצמבר'];

type View = 'month' | 'week' | 'day';
type StatusFilter = 'all' | 'planned' | 'completed' | 'cancelled' | 'no_show';

interface SessionWithRel extends Session {
  patient: {
    full_name: string;
    staff_member: { id: string; full_name: string } | null;
  } | null;
}
type StaffOpt   = { id: string; full_name: string };
type PatientOpt = { id: string; full_name: string };

/* ── date helpers ── */
function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfWeek(d: Date) {
  const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x;
}
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return ymd(a) === ymd(b); }

interface DndProps {
  draggingId:  string | null;
  dragOverYmd: string | null;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd:   () => void;
  onDragOver:  (e: React.DragEvent, target: string) => void;
  onDragLeave: (target: string) => void;
  onDrop:      (e: React.DragEvent, target: string) => void;
}

export default function CalendarPage() {
  const [view,    setView]    = useState<View>('month');
  const [anchor,  setAnchor]  = useState(new Date());
  const [records, setRecords] = useState<SessionWithRel[]>([]);
  const [patients,setPatients]= useState<PatientOpt[]>([]);
  const [staff,   setStaff]   = useState<StaffOpt[]>([]);
  const [loading, setLoading] = useState(true);

  const [patientFilter, setPatientFilter] = useState<string>('');
  const [staffFilter,   setStaffFilter]   = useState<string>('');
  const [statusFilter,  setStatusFilter]  = useState<StatusFilter>('all');

  const [editing, setEditing] = useState<Session | null>(null);
  const [open,    setOpen]    = useState(false);

  /* Drag-and-drop */
  const [draggingId,  setDraggingId]  = useState<string | null>(null);
  const [dragOverYmd, setDragOverYmd] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, p, st] = await Promise.all([
      supabase
        .from('sessions')
        .select('*, patient:patient_id(full_name, staff_member:staff_id(id, full_name))')
        .order('date', { ascending: true })
        .order('start_time', { ascending: true }),
      supabase.from('patients').select('id, full_name').order('full_name'),
      supabase.from('staff').select('id, full_name').order('full_name'),
    ]);
    setRecords((s.data ?? []) as unknown as SessionWithRel[]);
    setPatients((p.data ?? []) as PatientOpt[]);
    setStaff((st.data ?? []) as StaffOpt[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live-sync: any session created/edited/deleted from /sessions, another
  // tab, drag-drop, or the form modal triggers a refetch here.
  useSessionsLiveSync(load);

  /* Apply filters */
  const filtered = useMemo(() => records.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (patientFilter && r.patient_id !== patientFilter)     return false;
    if (staffFilter   && r.patient?.staff_member?.id !== staffFilter) return false;
    return true;
  }), [records, statusFilter, patientFilter, staffFilter]);

  /* Group sessions by date for fast lookup */
  const byDate = useMemo(() => {
    const m = new Map<string, SessionWithRel[]>();
    for (const r of filtered) {
      const arr = m.get(r.date) ?? [];
      arr.push(r);
      m.set(r.date, arr);
    }
    return m;
  }, [filtered]);

  /* Header label per view: { greg, hebrew } */
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
      const greg = `${a.getDate()} ${MONTH_LABELS[a.getMonth()].slice(0,3)} – ${b.getDate()} ${MONTH_LABELS[b.getMonth()].slice(0,3)} ${b.getFullYear()}`;
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

  function openCreate(date?: string) {
    setEditing(date ? ({ date } as Session) : null);
    setOpen(true);
  }
  function openEdit(s: Session) {
    setEditing(s);
    setOpen(true);
  }

  /* DnD: move session to a new date (date only — time stays the same) */
  async function moveSession(id: string, newDate: string) {
    const prev = records;
    setRecords(rs => rs.map(r => r.id === id ? { ...r, date: newDate } : r));
    const { error } = await supabase.from('sessions').update({ date: newDate }).eq('id', id);
    if (error) { setRecords(prev); alert('שגיאה בעדכון הפגישה'); return; }
    await load();
  }

  function onEventDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }
  function onEventDragEnd() {
    setDraggingId(null); setDragOverYmd(null);
  }
  function onCellDragOver(e: React.DragEvent, target: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverYmd !== target) setDragOverYmd(target);
  }
  function onCellDragLeave(target: string) {
    if (dragOverYmd === target) setDragOverYmd(null);
  }
  function onCellDrop(e: React.DragEvent, target: string) {
    e.preventDefault();
    const id = draggingId ?? e.dataTransfer.getData('text/plain');
    setDraggingId(null); setDragOverYmd(null);
    if (!id) return;
    const cur = records.find(r => r.id === id);
    if (!cur || cur.date === target) return;
    moveSession(id, target);
  }

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '32px 36px', direction: 'rtl' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              לוח שנה
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${filtered.length} פגישות בתצוגה`}
            </p>
          </div>
          <button
            onClick={() => openCreate(ymd(anchor))}
            style={{
              backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
              borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.22)', transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            + פגישה חדשה
          </button>
        </div>

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
            {(['month','week','day'] as View[]).map(v => (
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

          {/* Filters */}
          <select
            value={patientFilter}
            onChange={e => setPatientFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">כל המטופלות</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
          <select
            value={staffFilter}
            onChange={e => setStaffFilter(e.target.value)}
            style={selectStyle}
          >
            <option value="">כל הצוות</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            style={selectStyle}
          >
            <option value="all">כל הסטטוסים</option>
            <option value="planned">מתוכננת</option>
            <option value="completed">בוצעה</option>
            <option value="cancelled">בוטלה</option>
            <option value="no_show">לא הגיעה</option>
          </select>
        </div>

        {/* Calendar body */}
        <div style={{
          backgroundColor: C.card, borderRadius: 14,
          border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
        }}>
          {view === 'month' && (
            <MonthView
              anchor={anchor} byDate={byDate} loading={loading}
              onDayClick={openCreate} onEvent={openEdit}
              dnd={{ draggingId, dragOverYmd, onDragStart: onEventDragStart, onDragEnd: onEventDragEnd, onDragOver: onCellDragOver, onDragLeave: onCellDragLeave, onDrop: onCellDrop }}
            />
          )}
          {view === 'week'  && (
            <WeekView
              anchor={anchor} byDate={byDate} loading={loading}
              onDayClick={openCreate} onEvent={openEdit}
              dnd={{ draggingId, dragOverYmd, onDragStart: onEventDragStart, onDragEnd: onEventDragEnd, onDragOver: onCellDragOver, onDragLeave: onCellDragLeave, onDrop: onCellDrop }}
            />
          )}
          {view === 'day'   && <DayView   anchor={anchor} byDate={byDate} onAdd={openCreate}      onEvent={openEdit} loading={loading} />}
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing?.id ? 'עריכת פגישה' : 'פגישה חדשה'}>
        <SessionForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

/* ── Month view ── */
function MonthView({ anchor, byDate, onDayClick, onEvent, loading, dnd }: {
  anchor: Date; byDate: Map<string, SessionWithRel[]>;
  onDayClick: (d: string) => void; onEvent: (s: Session) => void; loading: boolean;
  dnd: DndProps;
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
          const inMonth   = d.getMonth() === m;
          const isToday   = sameDay(d, today);
          const events    = byDate.get(ymd(d)) ?? [];
          const row       = Math.floor(i / 7);
          const isDropTgt = dnd.dragOverYmd === ymd(d);
          return (
            <div
              key={i}
              onClick={() => onDayClick(ymd(d))}
              onDragOver={(e) => dnd.onDragOver(e, ymd(d))}
              onDragLeave={() => dnd.onDragLeave(ymd(d))}
              onDrop={(e) => dnd.onDrop(e, ymd(d))}
              style={{
                minHeight: 110, padding: '8px 8px 6px',
                borderBottom: row < 5 ? `1px solid ${C.border}` : 'none',
                borderLeft:   i % 7 < 6 ? `1px solid ${C.border}` : 'none',
                backgroundColor: isDropTgt ? C.accentSub : (!inMonth ? '#FAFCFF' : C.card),
                outline: isDropTgt ? `2px solid ${C.accent}` : 'none',
                outlineOffset: isDropTgt ? '-2px' : 0,
                cursor: 'pointer', transition: 'background-color 0.1s',
                position: 'relative',
              }}
              onMouseEnter={e => { if (inMonth && !isDropTgt) (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
              onMouseLeave={e => { if (!isDropTgt) (e.currentTarget as HTMLElement).style.backgroundColor = inMonth ? C.card : '#FAFCFF'; }}
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
                {events.slice(0, 3).map(ev => (
                  <EventChip
                    key={ev.id} ev={ev}
                    dragging={dnd.draggingId === ev.id}
                    onDragStart={(e) => dnd.onDragStart(e, ev.id)}
                    onDragEnd={dnd.onDragEnd}
                    onClick={(e) => { e.stopPropagation(); onEvent(ev); }}
                  />
                ))}
                {events.length > 3 && (
                  <div style={{ fontSize: 11, color: C.muted, paddingRight: 4 }}>
                    +{events.length - 3} נוספות
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
function WeekView({ anchor, byDate, onDayClick, onEvent, loading, dnd }: {
  anchor: Date; byDate: Map<string, SessionWithRel[]>;
  onDayClick: (d: string) => void; onEvent: (s: Session) => void; loading: boolean;
  dnd: DndProps;
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
          const events    = byDate.get(ymd(d)) ?? [];
          const isDropTgt = dnd.dragOverYmd === ymd(d);
          return (
            <div
              key={i}
              onClick={() => onDayClick(ymd(d))}
              onDragOver={(e) => dnd.onDragOver(e, ymd(d))}
              onDragLeave={() => dnd.onDragLeave(ymd(d))}
              onDrop={(e) => dnd.onDrop(e, ymd(d))}
              style={{
                padding: 8, borderLeft: i < 6 ? `1px solid ${C.border}` : 'none',
                cursor: 'pointer', transition: 'background-color 0.1s',
                display: 'flex', flexDirection: 'column', gap: 4,
                backgroundColor: isDropTgt ? C.accentSub : 'transparent',
                outline: isDropTgt ? `2px solid ${C.accent}` : 'none',
                outlineOffset: isDropTgt ? '-2px' : 0,
              }}
              onMouseEnter={e => { if (!isDropTgt) (e.currentTarget as HTMLElement).style.backgroundColor = '#FAFCFF'; }}
              onMouseLeave={e => { if (!isDropTgt) (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
            >
              {events.length === 0 ? (
                <div style={{ fontSize: 11, color: C.muted, padding: 4, opacity: 0.6 }}>—</div>
              ) : events.map(ev => (
                <EventCard
                  key={ev.id} ev={ev}
                  dragging={dnd.draggingId === ev.id}
                  onDragStart={(e) => dnd.onDragStart(e, ev.id)}
                  onDragEnd={dnd.onDragEnd}
                  onClick={(e) => { e.stopPropagation(); onEvent(ev); }}
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
function DayView({ anchor, byDate, onAdd, onEvent, loading }: {
  anchor: Date; byDate: Map<string, SessionWithRel[]>;
  onAdd: (d: string) => void; onEvent: (s: Session) => void; loading: boolean;
}) {
  const events = byDate.get(ymd(anchor)) ?? [];

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
          + פגישה ביום זה
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : events.length === 0 ? (
        <div style={{
          padding: '52px 24px', textAlign: 'center',
          borderRadius: 12, backgroundColor: '#F8FAFC', border: `1px dashed ${C.border}`,
        }}>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>אין פגישות ביום זה</p>
          <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>לחצי על הכפתור להוספת פגישה</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map(ev => (
            <EventCardLarge key={ev.id} ev={ev} onClick={() => onEvent(ev)} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Event UI primitives ── */
function EventChip({ ev, onClick, dragging, onDragStart, onDragEnd }: {
  ev: SessionWithRel;
  onClick: (e: React.MouseEvent) => void;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const st = SESSION_STATUS[ev.status] ?? SESSION_STATUS.planned;
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      title={`${ev.patient?.full_name ?? '—'} · ${ev.start_time}–${ev.end_time}`}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 7px', borderRadius: 5, fontSize: 11, fontWeight: 500,
        backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
        cursor: dragging ? 'grabbing' : 'grab', textAlign: 'right', width: '100%',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        opacity: dragging ? 0.4 : 1, transition: 'opacity 0.1s',
      }}
    >
      <span style={{ width: 4, height: 4, borderRadius: '50%', backgroundColor: st.dot, flexShrink: 0 }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ev.start_time?.slice(0,5)} {ev.patient?.full_name ?? '—'}
      </span>
    </button>
  );
}

function EventCard({ ev, onClick, dragging, onDragStart, onDragEnd }: {
  ev: SessionWithRel;
  onClick: (e: React.MouseEvent) => void;
  dragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const st = SESSION_STATUS[ev.status] ?? SESSION_STATUS.planned;
  return (
    <button
      onClick={onClick}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        padding: '6px 8px', borderRadius: 6, fontSize: 11,
        backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
        cursor: dragging ? 'grabbing' : 'grab', textAlign: 'right', width: '100%',
        borderRight: `3px solid ${st.dot}`,
        opacity: dragging ? 0.4 : 1, transition: 'opacity 0.1s',
      }}
    >
      <span style={{ fontWeight: 700, fontSize: 11 }}>
        {ev.start_time?.slice(0,5)}
      </span>
      <span style={{ fontWeight: 500, fontSize: 12, color: C.text, marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
        {ev.patient?.full_name ?? '—'}
      </span>
    </button>
  );
}

function EventCardLarge({ ev, onClick }: { ev: SessionWithRel; onClick: () => void }) {
  const st = SESSION_STATUS[ev.status] ?? SESSION_STATUS.planned;
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px', borderRadius: 10,
        backgroundColor: C.card, border: `1px solid ${C.border}`,
        borderRight: `3px solid ${st.dot}`,
        cursor: 'pointer', transition: 'all 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = st.border;
        e.currentTarget.style.backgroundColor = st.bg;
        e.currentTarget.style.borderRightColor = st.dot;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.backgroundColor = C.card;
        e.currentTarget.style.borderRightColor = st.dot;
      }}
    >
      <div style={{
        minWidth: 70, fontSize: 13, fontWeight: 700, color: C.text,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {ev.start_time?.slice(0,5)} – {ev.end_time?.slice(0,5)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {ev.patient?.full_name ?? '—'}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
          {ev.duration_minutes ? `${ev.duration_minutes} דק'` : ''}
          {ev.patient?.staff_member?.full_name && ` · ${ev.patient.staff_member.full_name}`}
        </div>
      </div>
      {ev.is_travel && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 10px', borderRadius: 14, fontSize: 11.5, fontWeight: 600,
          backgroundColor: '#EEF2FF', color: '#4338CA',
          border: '1px solid #C7D2FE', flexShrink: 0,
        }}>
          🚗 {travelModeLabel(ev.travel_mode)}
          {ev.travel_cost != null && ` · ${Number(ev.travel_cost).toFixed(2)} ₪`}
        </span>
      )}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
        backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: st.dot }} />
        {st.label}
      </span>
    </div>
  );
}

/* ── Small UI ── */
function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 32, height: 32, borderRadius: 7,
        border: `1px solid ${C.border}`, backgroundColor: C.card, color: C.sub,
        cursor: 'pointer', fontSize: 18, fontWeight: 600,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s',
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
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        border: `2.5px solid ${C.accentRim}`, borderTopColor: C.accent,
        margin: '0 auto', animation: 'spin 0.8s linear infinite',
      }} />
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, fontSize: 13,
  border: `1px solid ${C.border}`, backgroundColor: C.card, color: C.text,
  cursor: 'pointer', outline: 'none', minWidth: 120,
};
