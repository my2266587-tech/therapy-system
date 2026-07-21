import { supabase } from '@/lib/supabase';
import type { HourBank, WorkTimeEntry, HourBankTxType } from '@/types';

/**
 * Client-side helpers for the Hour Bank ("בנק שעות") module.
 *
 * Everything is measured in whole SECONDS. Timers and balances are the server's
 * responsibility — these wrappers just call the SECURITY DEFINER RPCs defined in
 * supabase/hour-bank.sql. The only time computed on the client is the *display*
 * of the running timer (elapsedSeconds), which is cosmetic; the authoritative
 * duration is recomputed on the server when the timer is stopped.
 */

/** Base quota shipped by default: 5 hours. */
export const DEFAULT_QUOTA_SECONDS = 5 * 3600;

/** Seconds remaining in the bank (never below zero for display purposes). */
export function remainingSeconds(bank: Pick<HourBank, 'quota_seconds' | 'used_seconds'>): number {
  return bank.quota_seconds - bank.used_seconds;
}

/** True when the bank is empty (no time left to start a new timer). */
export function isEmpty(bank: Pick<HourBank, 'quota_seconds' | 'used_seconds'>): boolean {
  return remainingSeconds(bank) <= 0;
}

/** Fraction (0–1) of the quota still remaining — for the progress bar. */
export function remainingFraction(bank: Pick<HourBank, 'quota_seconds' | 'used_seconds'>): number {
  if (bank.quota_seconds <= 0) return 0;
  const f = remainingSeconds(bank) / bank.quota_seconds;
  return Math.max(0, Math.min(1, f));
}

/** Seconds elapsed on the running timer, from the server start timestamp. */
export function elapsedSeconds(bank: Pick<HourBank, 'active_started_at'>, nowMs: number): number {
  if (!bank.active_started_at) return 0;
  const startMs = Date.parse(bank.active_started_at);
  if (Number.isNaN(startMs)) return 0;
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

/**
 * Human duration MAGNITUDE in Hebrew: "4 שעות ו־25 דקות". Rounds to whole
 * minutes and uses proper Hebrew forms for 1/2 hours and minutes. Always the
 * absolute value — callers that need a sign (e.g. the ledger) render it
 * themselves. Returns "0 דקות" for zero.
 */
export function formatDuration(totalSeconds: number): string {
  const secs = Math.round(Math.abs(totalSeconds));
  const minutesTotal = Math.round(secs / 60);
  const h = Math.floor(minutesTotal / 60);
  const m = minutesTotal % 60;

  const parts: string[] = [];
  if (h > 0) parts.push(hoursLabel(h));
  if (m > 0) parts.push(minutesLabel(m));
  if (parts.length === 0) return '0 דקות';
  return parts.join(' ו־');
}

function hoursLabel(h: number): string {
  if (h === 1) return 'שעה אחת';
  if (h === 2) return 'שעתיים';
  return `${h} שעות`;
}

function minutesLabel(m: number): string {
  if (m === 1) return 'דקה אחת';
  if (m === 2) return 'שתי דקות';
  return `${m} דקות`;
}

/** Running-timer clock: "H:MM:SS" (or "MM:SS" under an hour). */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Date + time, e.g. "21/07/2026 · 14:30". Empty string for null. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date} · ${time}`;
}

/** Time only, e.g. "14:30". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Hebrew label + polarity for each ledger transaction type. */
export const TX_META: Record<HourBankTxType, { label: string; positive: boolean }> = {
  load_reset:      { label: 'טעינה מחדש (מכסה חדשה)', positive: true },
  load_add:        { label: 'טעינה (הוספה ליתרה)',     positive: true },
  manual_add:      { label: 'תיקון ידני — הוספת זמן',  positive: true },
  manual_subtract: { label: 'תיקון ידני — הפחתת זמן',  positive: false },
  work:            { label: 'עבודה',                    positive: false },
  entry_edit:      { label: 'עריכת רשומת עבודה',        positive: false },
  entry_delete:    { label: 'מחיקת רשומת עבודה (זיכוי)', positive: true },
};

/** Convert an "H : M" pair from a form into seconds. */
export function hoursMinutesToSeconds(hours: number, minutes: number): number {
  const h = Number.isFinite(hours) ? Math.max(0, Math.floor(hours)) : 0;
  const m = Number.isFinite(minutes) ? Math.max(0, Math.floor(minutes)) : 0;
  return h * 3600 + m * 60;
}

/* ── RPC wrappers ─────────────────────────────────────────────────────────── */

export type RpcError = { code: string; message: string };

/** Map a Postgres RAISE code to a Hebrew message for the UI. */
export function friendlyRpcError(message: string | undefined | null): string {
  const m = message ?? '';
  if (m.includes('TIMER_ALREADY_RUNNING')) return 'כבר יש טיימר פעיל.';
  if (m.includes('NO_HOURS_LEFT'))         return 'אין שעות בבנק — יש להטעין מחדש כדי להתחיל עבודה.';
  if (m.includes('NO_ACTIVE_TIMER'))       return 'אין טיימר פעיל לעצירה.';
  if (m.includes('INVALID_AMOUNT'))        return 'כמות לא תקינה.';
  if (m.includes('INVALID_MODE'))          return 'סוג טעינה לא תקין.';
  if (m.includes('INVALID_DIRECTION'))     return 'כיוון תיקון לא תקין.';
  if (m.includes('INVALID_RANGE'))         return 'טווח הזמנים לא תקין — שעת הסיום לפני ההתחלה.';
  if (m.includes('ENTRY_NOT_FOUND'))       return 'הרשומה לא נמצאה.';
  return 'אירעה שגיאה. נסו שוב.';
}

export async function rpcGetBank(): Promise<HourBank> {
  const { data, error } = await supabase.rpc('hour_bank_get');
  if (error) throw error;
  return data as HourBank;
}

export async function rpcStart(note?: string): Promise<HourBank> {
  const { data, error } = await supabase.rpc('hour_bank_start', { p_note: note ?? null });
  if (error) throw error;
  return data as HourBank;
}

export async function rpcStop(note?: string): Promise<WorkTimeEntry> {
  const { data, error } = await supabase.rpc('hour_bank_stop', { p_note: note ?? null });
  if (error) throw error;
  return data as WorkTimeEntry;
}

export async function rpcReload(seconds: number, mode: 'add' | 'reset'): Promise<HourBank> {
  const { data, error } = await supabase.rpc('hour_bank_reload', { p_seconds: seconds, p_mode: mode });
  if (error) throw error;
  return data as HourBank;
}

export async function rpcAdjust(seconds: number, direction: 'add' | 'subtract', note?: string): Promise<HourBank> {
  const { data, error } = await supabase.rpc('hour_bank_adjust', {
    p_seconds: seconds, p_direction: direction, p_note: note ?? null,
  });
  if (error) throw error;
  return data as HourBank;
}

export async function rpcUpdateEntry(
  entryId: string, startedAt: string, endedAt: string, note?: string,
): Promise<WorkTimeEntry> {
  const { data, error } = await supabase.rpc('hour_bank_update_entry', {
    p_entry_id: entryId, p_started_at: startedAt, p_ended_at: endedAt, p_note: note ?? null,
  });
  if (error) throw error;
  return data as WorkTimeEntry;
}

export async function rpcDeleteEntry(entryId: string): Promise<void> {
  const { error } = await supabase.rpc('hour_bank_delete_entry', { p_entry_id: entryId });
  if (error) throw error;
}
