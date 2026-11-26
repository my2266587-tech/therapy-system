'use client';

/**
 * Automatic alerts for the personal calendar: every open item that has a
 * time (tasks.due_time) beeps and pops up when its time arrives — nothing to
 * set up per item. Works on any page while the system is open in the browser
 * (mounted in SidebarLayout). Also shows a system notification if the
 * browser allows it (asked on the first click).
 *
 *   - Reloads today's timed items every 2 minutes; checks the clock every
 *     15 seconds.
 *   - Opened the site a little late? Items up to 2 hours past still pop up.
 *   - "Already shown" is remembered per browser (localStorage), keyed by
 *     item + date + time, so moving an item to a new time alerts again.
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
const keyOf = (t: TimedItem) => `${t.id}|${t.due_date}|${t.due_time.slice(0, 5)}`;

function loadShown(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SHOWN_KEY) ?? '[]') as string[]); }
  catch { return new Set(); }
}
function saveShown(s: Set<string>) {
  try { localStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(s).slice(-300))); } catch { /* storage blocked */ }
}

export default function TaskReminderWatcher() {
  const [popups, setPopups] = useState<TimedItem[]>([]);
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
    const due = items.current.filter(t => {
      const at = atOf(t);
      return at <= now && at > now - LATE_MS && !shown.has(keyOf(t));
    });
    if (!due.length) return;
    due.forEach(t => shown.add(keyOf(t)));
    saveShown(shown);

    playReminderBeep();
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const t of due) {
        try {
          new Notification(`🔔 ${t.title}`, { body: `עכשיו · ${t.due_time.slice(0, 5)}`, tag: keyOf(t), lang: 'he', dir: 'rtl' });
        } catch { /* some mobile browsers only allow notifications via a service worker */ }
      }
    }
    setPopups(p => [...p, ...due.filter(d => !p.some(x => x.id === d.id))]);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function reload() {
      const now = new Date();
      // Today, plus yesterday so an item just before midnight isn't missed.
      const today = localYmd(now);
      const yesterday = localYmd(new Date(now.getTime() - 24 * 3600_000));
      const { data, error: err } = await supabase
        .from('tasks')
        .select('id, title, due_date, due_time')
        .eq('is_done', false)
        .not('due_time', 'is', null)
        .gte('due_date', yesterday)
        .lte('due_date', today)
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
    setPopups(p => p.filter(x => x.id !== t.id));
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
      {popups.map(t => (
        <div key={t.id} style={{
          background: C.card, border: `2px solid ${C.accent}`, borderRadius: 14,
          boxShadow: '0 10px 30px rgba(15,23,42,0.18)', padding: '14px 16px',
        }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.accent }}>🔔 הגיע הזמן · {t.due_time.slice(0, 5)}</div>
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
              onClick={() => setPopups(p => p.filter(x => x.id !== t.id))}
              style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${C.border}`, background: '#FFFFFF', color: C.sub, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
            >
              סגירה
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
