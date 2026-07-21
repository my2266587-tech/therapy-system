'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import HourBankCard from '@/components/hour-bank/HourBankCard';
import { ReloadForm, AdjustForm, EntryForm, StopForm } from '@/components/hour-bank/HourBankForms';
import {
  rpcGetBank, rpcStart, rpcStop, rpcReload, rpcAdjust, rpcUpdateEntry, rpcDeleteEntry,
  elapsedSeconds, formatDuration, formatClock, formatDateTime, formatTime, friendlyRpcError,
  TX_META,
} from '@/lib/hourBank';
import type { HourBank, WorkTimeEntry, HourBankTransaction } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  pos: '#0D9488', neg: '#DC2626',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

export default function HourBankPage() {
  const [bank, setBank] = useState<HourBank | null>(null);
  const [entries, setEntries] = useState<WorkTimeEntry[]>([]);
  const [txs, setTxs] = useState<HourBankTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [reloadOpen, setReloadOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<WorkTimeEntry | null>(null);

  const running = bank?.active_started_at != null;

  const load = useCallback(async () => {
    try {
      const b = await rpcGetBank();
      setBank(b);
      const [{ data: e }, { data: t }] = await Promise.all([
        supabase.from('work_time_entries').select('*').eq('bank_id', b.id).order('started_at', { ascending: false }),
        supabase.from('hour_bank_transactions').select('*').eq('bank_id', b.id).order('created_at', { ascending: false }).limit(200),
      ]);
      setEntries((e ?? []) as WorkTimeEntry[]);
      setTxs((t ?? []) as HourBankTransaction[]);
    } catch (err) {
      console.error('[hour-bank] load failed', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Tick the running-timer display once per second (display only). The interval
  // only exists while a timer is active, so it stops itself when work stops.
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);

  /* ── Action handlers ── */
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      const message = (err as { message?: string })?.message;
      alert(friendlyRpcError(message));
    } finally {
      setBusy(false);
    }
  }

  function handleStart() { run(() => rpcStart()); }

  function handleStopConfirm(note: string) {
    setStopOpen(false);
    run(() => rpcStop(note));
  }

  function handleReload(seconds: number, mode: 'add' | 'reset') {
    setReloadOpen(false);
    run(() => rpcReload(seconds, mode));
  }

  function handleAdjust(seconds: number, direction: 'add' | 'subtract', note: string) {
    setAdjustOpen(false);
    run(() => rpcAdjust(seconds, direction, note));
  }

  function handleEditSave(startedAt: string, endedAt: string, note: string) {
    const id = editEntry?.id;
    if (!id) return;
    setEditEntry(null);
    run(() => rpcUpdateEntry(id, startedAt, endedAt, note));
  }

  function handleDeleteEntry() {
    const id = editEntry?.id;
    if (!id) return;
    if (!confirm('האם למחוק רשומת עבודה זו? הזמן יוחזר לבנק.')) return;
    setEditEntry(null);
    run(() => rpcDeleteEntry(id));
  }

  const elapsed = bank ? elapsedSeconds(bank, nowMs) : 0;

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
            בנק שעות
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            ניהול שעות העבודה מול הלקוחה — טיימר, מכסה והיסטוריה.
          </p>
        </div>

        {loading || !bank ? (
          <CardSkeleton />
        ) : (
          <>
            <HourBankCard
              bank={bank}
              elapsed={elapsed}
              busy={busy}
              onStart={handleStart}
              onStop={() => setStopOpen(true)}
              onReload={() => setReloadOpen(true)}
            />

            {/* Work history */}
            <SectionHeader
              title="היסטוריית עבודה"
              action={{ label: 'תיקון ידני', onClick: () => setAdjustOpen(true) }}
            />
            {entries.length === 0 ? (
              <EmptyBox text="עדיין לא נרשמו רשומות עבודה." />
            ) : (
              <div style={{
                backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
                boxShadow: C.shadow, overflow: 'hidden', marginBottom: 26,
              }}>
                {entries.map((e, i) => (
                  <EntryRow key={e.id} entry={e} last={i === entries.length - 1} onClick={() => setEditEntry(e)} />
                ))}
              </div>
            )}

            {/* Transactions ledger */}
            <SectionHeader title="יומן טעינות ותנועות" />
            {txs.length === 0 ? (
              <EmptyBox text="אין תנועות להצגה." />
            ) : (
              <div style={{
                backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
                boxShadow: C.shadow, overflow: 'hidden',
              }}>
                {txs.map((t, i) => (
                  <TxRow key={t.id} tx={t} last={i === txs.length - 1} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      <Modal open={reloadOpen} onClose={() => setReloadOpen(false)} title="הטענת בנק שעות">
        <ReloadForm onSave={handleReload} onCancel={() => setReloadOpen(false)} busy={busy} />
      </Modal>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="תיקון ידני">
        <AdjustForm onSave={handleAdjust} onCancel={() => setAdjustOpen(false)} busy={busy} />
      </Modal>

      <Modal open={stopOpen} onClose={() => setStopOpen(false)} title="עצירת טיימר">
        <StopForm
          initialNote={bank?.active_note ?? ''}
          elapsedLabel={formatClock(elapsed)}
          onSave={handleStopConfirm}
          onCancel={() => setStopOpen(false)}
          busy={busy}
        />
      </Modal>

      <Modal open={editEntry != null} onClose={() => setEditEntry(null)} title="עריכת רשומת עבודה">
        {editEntry && (
          <EntryForm
            entry={editEntry}
            onSave={handleEditSave}
            onDelete={handleDeleteEntry}
            onCancel={() => setEditEntry(null)}
            busy={busy}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── Section header with optional action button ── */
function SectionHeader({ title, action }: { title: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 12px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h2>
      {action && (
        <button
          onClick={action.onClick}
          style={{
            border: `1px solid ${C.border}`, backgroundColor: 'transparent', color: C.sub,
            borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.12s',
          }}
          onMouseEnter={e => { const el = e.currentTarget; el.style.backgroundColor = C.accentSub; el.style.borderColor = C.accentRim; el.style.color = C.accent; }}
          onMouseLeave={e => { const el = e.currentTarget; el.style.backgroundColor = 'transparent'; el.style.borderColor = C.border; el.style.color = C.sub; }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/* ── One work-entry row (click to edit) ── */
function EntryRow({ entry, last, onClick }: { entry: WorkTimeEntry; last: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '13px 18px', cursor: 'pointer',
        borderBottom: last ? 'none' : `1px solid #F1F5F9`, transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {formatDateTime(entry.started_at)} – {formatTime(entry.ended_at)}
        </div>
        {entry.note && (
          <div style={{ fontSize: 13, color: C.sub, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 460 }}>
            {entry.note}
          </div>
        )}
        {entry.performed_by && (
          <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>בוצע ע״י: {entry.performed_by}</div>
        )}
      </div>
      <div style={{
        flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: C.accent,
        backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
        borderRadius: 20, padding: '4px 12px', whiteSpace: 'nowrap',
      }}>
        {formatDuration(entry.duration_seconds)}
      </div>
    </div>
  );
}

/* ── One ledger row ── */
function TxRow({ tx, last }: { tx: HourBankTransaction; last: boolean }) {
  const meta = TX_META[tx.type] ?? { label: tx.type, positive: tx.amount_seconds >= 0 };
  const positive = tx.amount_seconds >= 0;
  const color = positive ? C.pos : C.neg;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      padding: '11px 18px', borderBottom: last ? 'none' : `1px solid #F1F5F9`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>{meta.label}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
          {formatDateTime(tx.created_at)}{tx.performed_by ? ` · ${tx.performed_by}` : ''}
        </div>
        {tx.note && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 2 }}>{tx.note}</div>}
      </div>
      <div style={{ flexShrink: 0, fontSize: 13.5, fontWeight: 700, color, whiteSpace: 'nowrap' }}>
        {positive ? '+' : '−'}{formatDuration(tx.amount_seconds)}
      </div>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
      padding: '28px 20px', textAlign: 'center', fontSize: 13.5, color: C.muted, marginBottom: 26,
    }}>
      {text}
    </div>
  );
}

function CardSkeleton() {
  return (
    <div style={{
      backgroundColor: C.card, borderRadius: 18, border: `1px solid ${C.border}`,
      boxShadow: C.shadow, padding: '26px 28px',
    }}>
      <div style={{ height: 14, width: '25%', backgroundColor: '#F1F5F9', borderRadius: 6, marginBottom: 12 }} />
      <div style={{ height: 30, width: '45%', backgroundColor: '#F1F5F9', borderRadius: 8, marginBottom: 18 }} />
      <div style={{ height: 12, width: '100%', backgroundColor: '#F1F5F9', borderRadius: 99, marginBottom: 20 }} />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ height: 42, width: 140, backgroundColor: '#F1F5F9', borderRadius: 10 }} />
        <div style={{ height: 42, width: 120, backgroundColor: '#F8FAFC', borderRadius: 10 }} />
      </div>
    </div>
  );
}
