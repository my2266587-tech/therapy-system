'use client';

/**
 * In-app replacements for the browser's alert() / confirm():
 *
 *   const { confirm, toast } = useFeedback();
 *   if (!(await confirm({ message: 'למחוק את הפגישה?' }))) return;
 *   toast.error('שגיאה בשמירה');   toast.success('נשמר');
 *
 * Why: the native dialogs block the whole tab, can't be styled, mix
 * LTR/RTL badly and look like a browser warning rather than part of the app.
 */

import {
  createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode,
} from 'react';

interface ConfirmOptions {
  message: string;
  title?: string;
  /** Text of the confirming button. Default: 'מחיקה'. */
  confirmLabel?: string;
  /** Red confirm button (destructive action). Default: true. */
  danger?: boolean;
}

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem { id: number; kind: ToastKind; text: string }

interface FeedbackApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  toast: Record<ToastKind, (text: string) => void>;
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

const TOAST_MS = 4500;
const TOAST_COLORS: Record<ToastKind, { bg: string; border: string; text: string }> = {
  success: { bg: '#F0FDF4', border: '#BBF7D0', text: '#166534' },
  error:   { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B' },
  info:    { bg: '#F8FAFC', border: '#E2E8F0', text: '#0F172A' },
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const confirm = useCallback((opts: ConfirmOptions) =>
    new Promise<boolean>(resolve => setDialog({ ...opts, resolve })), []);

  const close = useCallback((ok: boolean) => {
    setDialog(d => { d?.resolve(ok); return null; });
  }, []);

  const push = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++;
    setToasts(t => [...t, { id, kind, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), TOAST_MS);
  }, []);

  const [api] = useState<FeedbackApi>(() => ({
    confirm,
    toast: {
      success: text => push('success', text),
      error:   text => push('error', text),
      info:    text => push('info', text),
    },
  }));

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {dialog && <ConfirmDialog {...dialog} onClose={close} />}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', bottom: 20, left: 20, zIndex: 70,
          display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 'calc(100vw - 40px)',
        }}
      >
        {toasts.map(t => {
          const c = TOAST_COLORS[t.kind];
          return (
            <div
              key={t.id}
              role={t.kind === 'error' ? 'alert' : 'status'}
              onClick={() => setToasts(all => all.filter(x => x.id !== t.id))}
              style={{
                direction: 'rtl', minWidth: 240, maxWidth: 380, padding: '12px 16px',
                borderRadius: 10, border: `1px solid ${c.border}`, backgroundColor: c.bg, color: c.text,
                fontSize: 14, fontWeight: 500, lineHeight: 1.5, cursor: 'pointer',
                boxShadow: '0 8px 24px rgba(15,23,42,0.12)', animation: 'fadeIn 0.15s ease-out',
              }}
            >
              {t.text}
            </div>
          );
        })}
      </div>
    </FeedbackContext.Provider>
  );
}

function ConfirmDialog({ title, message, confirmLabel = 'מחיקה', danger = true, onClose }:
  ConfirmOptions & { onClose: (ok: boolean) => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const okRef     = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Destructive → focus "ביטול" so a stray Enter doesn't delete anything.
    (danger ? cancelRef : okRef).current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [danger, onClose]);

  const btn = (primary: boolean) => ({
    padding: '9px 18px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
    border: primary ? 'none' : '1px solid #E2E8F0',
    backgroundColor: primary ? (danger ? '#DC2626' : '#0D9488') : '#FFFFFF',
    color: primary ? '#FFFFFF' : '#0F172A',
  });

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(false); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 16,
        backgroundColor: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(3px)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        style={{
          direction: 'rtl', width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF',
          borderRadius: 14, border: '1px solid #E2E8F0', padding: '22px 24px 18px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.18)', animation: 'fadeIn 0.15s ease-out',
        }}
      >
        <h2 id="confirm-title" style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', margin: '0 0 8px' }}>
          {title ?? (danger ? 'אישור מחיקה' : 'אישור')}
        </h2>
        <p id="confirm-message" style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, margin: 0 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginTop: 20 }}>
          <button ref={okRef} onClick={() => onClose(true)} style={btn(true)}>{confirmLabel}</button>
          <button ref={cancelRef} onClick={() => onClose(false)} style={btn(false)}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
