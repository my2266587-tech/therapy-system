'use client';

/**
 * Automatic alerts for the personal calendar: every open item that has a
 * time (tasks.due_time) alerts three times — nothing to set up per item:
 *     15 min before → 1 beep  · "בעוד רבע שעה"  (time to wrap up / get ready)
 *      5 min before → 2 beeps · "בעוד 5 דקות"   (last call)
 *      at the time  → 3 beeps · "הגיע הזמן"
 * Each item has one pop-up that updates as it gets closer. "✓ בוצע" stops
 * the remaining alerts for that item; "סגירה" only closes the current one.
 * Opening the site late shows only the stage that's current — never a stale
 * "in 15 minutes". Works on any page while the system is open in the browser
 * (mounted in SidebarLayout). Also shows a system notification if the
 * browser allows it (asked on the first click).
 *
 *   - Reloads today's timed items every 2 minutes; checks the clock every
 *     15 seconds.
 *   - Opened the site a little late? The "now" alert still pops up up to
 *     2 hours after the time.
 *   - "Already shown" is remembered per browser (localStorage), keyed by
 *     item + date + time + stage, so moving an item to a new time alerts again.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { colors as C } from '@/lib/theme';
import { playReminderBeep, requestNotificationPermission, unlockAudio } from '@/lib/taskReminders';

interface TimedItem {
  id: string;
  title: string;
  due_date: string;
  due_time: string;
}

interface Stage { minutes: number; beeps: number; label: string }
/** Ordered from earliest to latest. */
const STAGES: Stage[] = [
  { minutes: 15, beeps: 1, label: 'בעוד רבע שעה' },
  { minutes: 5,  beeps: 2, label: 'בעוד 5 דקות' },
  { minutes: 0,  beeps: 3, label: 'הגיע הזמן' },
];

interface Popup { item: TimedItem; stage: Stage }

const SHOWN_KEY = 'task-alerts:shown';
const LATE_MS   = 2 * 3600_000;
const RELOAD_MS = 2 * 60_000;
const TICK_MS   = 15_000;

function localYmd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Local (browser) time of the item. */
function atOf(t: TimedItem): number {
  const [y, m, d] = t.due_date.split('-').map(Number);
  const [hh, mm] = t.due_time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
}
const keyOf = (t: TimedItem, st: Stage) => `${t.id}|${t.due_date}|${t.due_time.slice(0, 5)}|${st.minutes}`;

/** The latest stage whose moment has passed, or null (too early / too late). */
function currentStage(t: TimedItem, now: number): Stage | null {
  const at = atOf(t);
  if (now < at - STAGES[0].minutes * 60_000 || now > at + LATE_MS) return null;
  let cur: Stage | null = null;
  for (const st of STAGES) if (now >= at - st.minutes * 60_000) cur = st;
  return cur;
}

function loadShown(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
function saveShown(s: Set<string>) {
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(s).slice(-300))); } catch { /* storage blocked */ }
}

export default function TaskReminderWatcher() {
  const [popups, setPopups] = useState<Popup[]>([]);
  const [error,  setError]  = useState('');
  const items = useRef<TimedItem[]>([]);

  // Sound + notifications are only allowed after a user gesture.
  useEffect(() => {
    const unlock = () => { unlockAudio(); requestNotificationPermission(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const fire = useCallback(() => {
    const now = Date.now();
    const shown = loadShown();
    const due: Popup[] = [];
    for (const item of items.current) {
      const stage = currentStage(item, now);
      if (stage && !shown.has(keyOf(item, stage))) due.push({ item, stage });
    }
    if (!due.length) return;
    due.forEach(d => shown.add(keyOf(d.item, d.stage)));
    saveShown(shown);

    // One sound for the batch — as urgent as the closest item.
    playReminderBeep(Math.max(...due.map(d => d.stage.beeps)));
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const d of due) {
        try {
          new Notification(`🔔 ${d.stage.label}: ${d.item.title}`, {
            body: `בשעה ${d.item.due_time.slice(0, 5)}`, tag: d.item.id, lang: 'he', dir: 'rtl',
          });
        } catch { /* some mobile browsers only allow notifications via a service worker */ }
      }
    }
    // One pop-up per item: a newer stage replaces the older one.
    setPopups(p => [...p.filter(x => !due.some(d => d.item.id === x.item.id)), ...due]
      .sort((a, b) => atOf(a.item) - atOf(b.item)));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function reload() {
      const now = new Date();
      // Yesterday → tomorrow, so items around midnight aren't missed.
      const yesterday = localYmd(new Date(now.getTime() - 24 * 3600_000));
      const tomorrow  = localYmd(new Date(now.getTime() + 24 * 3600_000));
      const { data, error: err } = await supabase
        .from('tasks')
        .select('id, title, due_date, due_time')
        .eq('is_done', false)
        .not('due_time', 'is', null)
        .gte('due_date', yesterday)
        .lte('due_date', tomorrow)
        .order('due_time')
        .limit(500);
      if (cancelled) return;
      if (err) { setError('לא הצלחתי לטעון את היומן להתראות'); return; }
      setError('');
      items.current = (data ?? []) as TimedItem[];
      fire();
    }

    void reload();
    const reloadId = setInterval(() => void reload(), RELOAD_MS);
    const tickId   = setInterval(fire, TICK_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(reloadId);
      clearInterval(tickId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fire]);

  async function markDone(t: TimedItem) {
    const { error: err } = await supabase.from('tasks')
      .update({ is_done: true, completed_at: new Date().toISOString() })
      .eq('id', t.id);
    if (err) { setError('הסימון כבוצע נכשל — נסי שוב'); return; }
    items.current = items.current.filter(x => x.id !== t.id);
    setPopups(p => p.filter(x => x.item.id !== t.id));
  }

  if (!popups.length && !error) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      style={{
        position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1100, width: 'min(420px, calc(100vw - 24px))',
        display: 'flex', flexDirection: 'column', gap: 10, direction: 'rtl',
      }}
    >
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#FEF2F2', border: '1px solid #FECACA', color: C.danger, borderRadius: 12, padding: '8px 12px', fontSize: 13.5 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="סגירה"
            style={{ minWidth: 44, minHeight: 36, border: 'none', background: 'none', color: C.danger, fontSize: 18, cursor: 'pointer' }}>×</button>
        </div>
      )}
      {popups.map(({ item: t, stage }) => {
        const isNow = stage.minutes === 0;
        return (
          <div key={t.id} style={{
            background: isNow ? C.card : '#FFFBEB',
            border: `2px solid ${isNow ? C.accent : '#F59E0B'}`, borderRadius: 14,
            boxShadow: '0 10px 30px rgba(15,23,42,0.18)', padding: '14px 16px',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: isNow ? C.accent : '#B45309' }}>
              {isNow ? "🔔" : "⏰"} {stage.label} · {t.due_time.slice(0, 5)}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginTop: 4, wordBreak: 'break-word' }}>{t.title}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => void markDone(t)}
                style={{ flex: 1, minHeight: 44, borderRadius: 10, border: 'none', background: C.accent, color: '#FFFFFF', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
              >
                ✓ בוצע
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setPopups(p => p.filter(x => x.item.id !== t.id))}
                style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: '#FFFFFF', color: C.sub, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
              >
                סגירה
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
