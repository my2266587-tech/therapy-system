'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * Floating side assistant — does not block the page.
 *
 * Mounted persistently inside SidebarLayout. The component never
 * unmounts during normal navigation, so:
 *   - chat history stays across open/close cycles
 *   - the composer's draft stays across open/close cycles
 *   - clicking the FAB re-opens to exactly the previous state
 *
 * Closed state = launcher FAB only.
 * Open state   = a 380px floating side panel on desktop (with the rest of
 *                the page fully visible and interactive behind it),
 *                or a full-screen sheet on mobile.
 *
 * No logic change vs. the previous version — only UX.
 */

interface RowItem  { title: string; subtitle?: string; href?: string }
interface LinkItem { label: string; href: string }
type AssistantAction =
  | { type: 'open_patient'; patient_id: string; patient_name: string };

interface AssistantMessage {
  id:     string;
  role:   'user' | 'assistant';
  text:   string;
  rows?:  RowItem[];
  links?: LinkItem[];
  error?: boolean;
  /**
   * Some assistant responses are pure side-effects (router.push). When set,
   * we suppress the rows/links UI — the navigation IS the answer.
   */
  isAction?: boolean;
}

interface PatientFocus { id: string; name: string }

const EXAMPLES = [
  'איך מוסיפים מטופלת חדשה?',
  'איך שולחים טופס הצטרפות?',
  'איך מפיקים דוח חודשי?',
  'מי אחראי על שירן?',
  'אילו פגישות יש היום?',
  'למי חסר סיכום פגישה?',
] as const;

const C = {
  card:        '#FFFFFF',
  border:      '#E8ECF0',
  text:        '#1A2332',
  sub:         '#64748B',
  muted:       '#94A3B8',
  accent:      '#0D9488',
  accentSub:   '#F0FDF9',
  accentRim:   '#99F6E4',
  bg:          '#F6F8FB',
  userBubble:  '#0D9488',
  userText:    '#FFFFFF',
  botBubble:   '#FFFFFF',
  errorBubble: '#FEF2F2',
  errorText:   '#DC2626',
};

export default function AssistantDrawer() {
  const router = useRouter();
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [focus, setFocus]       = useState<PatientFocus | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef  = useRef<HTMLTextAreaElement | null>(null);

  /**
   * The focus has to be readable at send-time from inside the callback,
   * but the callback closes over the state from the render where it was
   * created. Mirror it into a ref so the latest focus is always sent.
   */
  const focusRef = useRef<PatientFocus | null>(null);
  useEffect(() => { focusRef.current = focus; }, [focus]);

  /** Same for messages — needed to assemble the conversation history. */
  const messagesRef = useRef<AssistantMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  /* ── Responsive: detect mobile breakpoint ──────────────────────── */

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  /* ── Behavior: scroll-to-bottom + autofocus + Esc ───────────────── */

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [open, messages.length, sending]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /* ── Send / clear ──────────────────────────────────────────────── */

  const send = useCallback(async (raw: string) => {
    const question = raw.trim();
    if (!question || sending) return;

    const userId = `u-${Date.now()}`;
    setMessages(prev => [...prev, { id: userId, role: 'user', text: question }]);
    setInput('');
    setSending(true);

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    if (!token) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', error: true,
        text: 'יש להתחבר מחדש כדי להשתמש בעוזר.',
      }]);
      setSending(false);
      return;
    }

    // Build context payload from refs (latest values, not the render
    // where this callback was created).
    const history = messagesRef.current
      .slice(-6)
      .map(m => ({ role: m.role, text: m.text }));
    const ctxFocus = focusRef.current;

    try {
      const res = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          question,
          history,
          context: ctxFocus ? { lastPatient: ctxFocus } : {},
        }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant', error: true,
          text: json?.error ?? 'שגיאה בעיבוד השאלה.',
        }]);
        return;
      }

      const action: AssistantAction | null = json?.action ?? null;
      const newFocus: PatientFocus | null  = json?.patient_focus ?? null;

      // Update conversation focus before showing the message so the next
      // user turn already has it.
      if (newFocus && (!ctxFocus || ctxFocus.id !== newFocus.id)) {
        setFocus(newFocus);
      }

      // Pure navigation action: don't render rows/links — just announce
      // and push. The drawer also auto-closes so the patient page
      // becomes the focus.
      if (action && action.type === 'open_patient') {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant',
          text:     json.answer ?? `פותחת את הכרטיס של ${action.patient_name}.`,
          isAction: true,
        }]);
        router.push(`/patients/${action.patient_id}`);
        setOpen(false);
        return;
      }

      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant',
        text:  json.answer ?? '',
        rows:  json.rows  ?? [],
        links: json.links ?? [],
      }]);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', error: true,
        text: `שגיאת רשת: ${(e as Error).message}`,
      }]);
    } finally {
      setSending(false);
    }
  }, [sending, router]);

  const clearChat = useCallback(() => {
    if (messages.length === 0) return;
    if (!window.confirm('למחוק את היסטוריית השיחה?')) return;
    setMessages([]);
    setFocus(null);
  }, [messages.length]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  /* ── Geometry ──────────────────────────────────────────────────── */

  const panelStyle: React.CSSProperties = isMobile
    ? {
        top: 0, bottom: 0, insetInlineStart: 0, insetInlineEnd: 0,
        width: 'auto', borderRadius: 0,
      }
    : {
        top: 16, bottom: 16, insetInlineStart: 16,
        width: 380, borderRadius: 16,
      };

  /* ── Render ───────────────────────────────────────────────────── */

  return (
    <>
      {/* ── Floating launcher ─ visible only when drawer is closed ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="עוזר חכם"
          aria-label="פתח עוזר חכם"
          style={{
            position: 'fixed', insetInlineStart: 24, bottom: 24,
            width: 52, height: 52, borderRadius: '50%', border: 'none',
            backgroundColor: C.accent, color: '#FFFFFF',
            boxShadow: '0 8px 24px rgba(13,148,136,0.35)',
            cursor: 'pointer', zIndex: 60,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'transform 0.12s, box-shadow 0.12s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 12px 28px rgba(13,148,136,0.45)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 24px rgba(13,148,136,0.35)';
          }}
        >
          <SparkleIcon />
          {messages.length > 0 && (
            <span aria-label={`${messages.length} הודעות`} style={{
              position: 'absolute', insetInlineEnd: -2, top: -2,
              minWidth: 18, height: 18, padding: '0 5px',
              borderRadius: 9, backgroundColor: '#FFFFFF',
              color: C.accent, fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${C.accent}`,
            }}>
              {messages.filter(m => m.role === 'user').length}
            </span>
          )}
        </button>
      )}

      {/*
        ── Drawer ── always mounted so chat + draft persist across closes.
        Pointer-events flips to none when closed so the panel can't intercept
        clicks on the dashboard behind it. No backdrop, no scroll lock —
        the page stays fully usable.
      */}
      <aside
        role="dialog"
        aria-label="עוזר חכם"
        aria-hidden={!open}
        style={{
          position: 'fixed', zIndex: 70, direction: 'rtl',
          ...panelStyle,
          backgroundColor: 'rgba(255,255,255,0.92)',
          backdropFilter:   'blur(14px) saturate(180%)',
          WebkitBackdropFilter: 'blur(14px) saturate(180%)',
          border: `1px solid ${C.border}`,
          boxShadow: open
            ? '0 12px 36px rgba(15,23,42,0.16), 0 2px 6px rgba(15,23,42,0.06)'
            : 'none',
          transform: open ? 'translateX(0) scale(1)' : `translateX(${isMobile ? '-100%' : 'calc(-100% - 24px)'}) scale(0.985)`,
          opacity:   open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.2s, box-shadow 0.2s',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 30, height: 30, borderRadius: 8, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.accentSub, color: C.accent, border: `1px solid ${C.accentRim}`,
              flexShrink: 0,
            }}>
              <SparkleIcon size={15} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text }}>עוזר חכם</p>
              <p style={{ margin: '1px 0 0', fontSize: 10.5, color: C.muted }}>
                {focus
                  ? `בשיחה על ${focus.name}`
                  : messages.length === 0
                    ? 'מוכן לשאלות'
                    : `${messages.length} הודעות`}
              </p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <IconBtn label="מחיקת שיחה" onClick={clearChat} disabled={messages.length === 0}>
              <BroomIcon />
            </IconBtn>
            <IconBtn label="מזעור" onClick={() => setOpen(false)}>
              <MinimizeIcon />
            </IconBtn>
            <IconBtn label="סגור" onClick={() => setOpen(false)}>
              <CloseIcon />
            </IconBtn>
          </div>
        </div>

        {/* Conversation area */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}
        >
          {messages.length === 0 ? (
            <EmptyState onPick={q => send(q)} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {messages.map(m => <MessageBubble key={m.id} msg={m} onClose={() => setOpen(false)} />)}
              {sending && <ThinkingBubble />}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{
          padding: '10px 12px', borderTop: `1px solid ${C.border}`,
          backgroundColor: 'rgba(255,255,255,0.6)', flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            border: `1px solid ${C.border}`, borderRadius: 11,
            padding: '7px 9px', backgroundColor: C.card,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="שאלי שאלה... (Enter לשליחה)"
              rows={1}
              dir="rtl"
              style={{
                flex: 1, resize: 'none', border: 'none', outline: 'none',
                background: 'transparent', fontSize: 13.5, color: C.text,
                fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 110,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              aria-label="שליחה"
              style={{
                flexShrink: 0,
                width: 30, height: 30, borderRadius: 7, border: 'none',
                backgroundColor: !input.trim() || sending ? C.border : C.accent,
                color: '#FFFFFF',
                cursor: !input.trim() || sending ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background-color 0.12s',
              }}
            >
              <SendIcon />
            </button>
          </div>
          <p style={{
            margin: '5px 4px 0', fontSize: 10, color: C.muted, textAlign: 'right',
          }}>
            הבוט קורא בלבד — לא מבצע שינויים.
          </p>
        </div>
      </aside>
    </>
  );
}

/* ── Header icon button ─────────────────────────────────────────────── */

function IconBtn({
  label, onClick, disabled, children,
}: {
  label: string; onClick: () => void; disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      disabled={disabled}
      style={{
        width: 28, height: 28, borderRadius: 6, border: 'none',
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        color: disabled ? '#CBD5E1' : C.sub,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background-color 0.1s, color 0.1s',
      }}
      onMouseEnter={e => {
        if (disabled) return;
        const el = e.currentTarget as HTMLElement;
        el.style.backgroundColor = C.bg;
        el.style.color = C.text;
      }}
      onMouseLeave={e => {
        if (disabled) return;
        const el = e.currentTarget as HTMLElement;
        el.style.backgroundColor = 'transparent';
        el.style.color = C.sub;
      }}
    >
      {children}
    </button>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div style={{ padding: '6px 0' }}>
      <div style={{
        backgroundColor: C.card, border: `1px solid ${C.border}`,
        borderRadius: 11, padding: '14px 16px', marginBottom: 12,
      }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
          איך אפשר לעזור?
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
          שאלי בעברית טבעית — גם איך עושים פעולות במערכת וגם מידע על מטופלות, פגישות ותשלומים.
        </p>
      </div>
      <p style={{ fontSize: 10.5, fontWeight: 600, color: C.muted, margin: '0 0 6px',
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        דוגמאות
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {EXAMPLES.map(q => (
          <button
            key={q}
            onClick={() => onPick(q)}
            style={{
              textAlign: 'right', padding: '9px 11px',
              backgroundColor: C.card, border: `1px solid ${C.border}`,
              borderRadius: 8, fontSize: 12.5, color: C.text, cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = C.accentSub;
              el.style.borderColor = C.accentRim;
              el.style.color = C.accent;
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.backgroundColor = C.card;
              el.style.borderColor = C.border;
              el.style.color = C.text;
            }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── Message bubble ──────────────────────────────────────────────────── */

function MessageBubble({ msg, onClose }: { msg: AssistantMessage; onClose: () => void }) {
  const isUser  = msg.role === 'user';
  const isError = !!msg.error;

  const bubbleBg =
    isUser  ? C.userBubble  :
    isError ? C.errorBubble :
              C.botBubble;
  const textColor =
    isUser  ? C.userText   :
    isError ? C.errorText  :
              C.text;

  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '92%',
        backgroundColor: bubbleBg, color: textColor,
        border: isUser ? 'none' : `1px solid ${isError ? '#FECACA' : C.border}`,
        borderRadius: 11,
        borderEndStartRadius: !isUser ? 4 : 11,
        borderEndEndRadius:    isUser ? 4 : 11,
        padding: '9px 12px',
        fontSize: 13, lineHeight: 1.55,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        <p style={{ margin: 0 }}>{msg.text}</p>

        {!msg.isAction && msg.rows && msg.rows.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {msg.rows.map((r, i) => (
              <RowLine key={i} row={r} onClose={onClose} />
            ))}
          </div>
        )}

        {!msg.isAction && msg.links && msg.links.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {msg.links.map((l, i) => (
              <Link
                key={i}
                href={l.href}
                onClick={onClose}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 9px', borderRadius: 16,
                  fontSize: 11, fontWeight: 600,
                  backgroundColor: C.accentSub, color: C.accent,
                  border: `1px solid ${C.accentRim}`, textDecoration: 'none',
                }}
              >
                {l.label} ←
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function RowLine({ row, onClose }: { row: RowItem; onClose: () => void }) {
  const inner = (
    <>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: C.text }}>{row.title}</span>
      {row.subtitle && (
        <span style={{ fontSize: 11, color: C.muted, display: 'block' }}>
          {row.subtitle}
        </span>
      )}
    </>
  );
  if (row.href) {
    return (
      <Link
        href={row.href}
        onClick={onClose}
        style={{
          display: 'block', padding: '6px 9px', borderRadius: 6,
          backgroundColor: C.card, border: `1px solid ${C.border}`,
          textDecoration: 'none',
        }}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div style={{
      padding: '6px 9px', borderRadius: 6,
      backgroundColor: C.card, border: `1px solid ${C.border}`,
    }}>
      {inner}
    </div>
  );
}

function ThinkingBubble() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        backgroundColor: C.botBubble, border: `1px solid ${C.border}`,
        borderRadius: 11, borderEndStartRadius: 4,
        padding: '9px 12px',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {[0, 1, 2].map(i => (
          <span
            key={i}
            style={{
              width: 6, height: 6, borderRadius: '50%', backgroundColor: C.accent,
              opacity: 0.55, animation: `assistant-dot 1.2s infinite ease-in-out`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
        <style>{`@keyframes assistant-dot {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0); }
          40%           { opacity: 1;    transform: translateY(-2px); }
        }`}</style>
      </div>
    </div>
  );
}

/* ── Icons ──────────────────────────────────────────────────────────── */

function SparkleIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3z"/>
      <path d="M19 16l.8 2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-1L19 16z"/>
    </svg>
  );
}

function CloseIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function MinimizeIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="18" x2="19" y2="18"/>
    </svg>
  );
}

function BroomIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  );
}

function SendIcon({ size = 13 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
