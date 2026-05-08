'use client';

import { useEffect, useRef, useState, useCallback, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

interface RowItem  { title: string; subtitle?: string; href?: string }
interface LinkItem { label: string; href: string }

interface AssistantMessage {
  id:     string;
  role:   'user' | 'assistant';
  text:   string;
  rows?:  RowItem[];
  links?: LinkItem[];
  error?: boolean;
}

const EXAMPLES = [
  'אילו פגישות יש היום?',
  'מי המטופלות למחר?',
  'למי חסר סיכום פגישה?',
  'אילו תשלומים עדיין פתוחים?',
  'אילו הקלטות לא עובדו?',
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
  botBubble:   '#F8FAFC',
  errorBubble: '#FEF2F2',
  errorText:   '#DC2626',
};

export default function AssistantDrawer() {
  const [open, setOpen]       = useState(false);
  const [input, setInput]     = useState('');
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef  = useRef<HTMLTextAreaElement | null>(null);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, sending]);

  // Focus input when drawer opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open]);

  // Esc closes drawer
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

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

    try {
      const res = await fetch('/api/assistant/query', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({ question }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setMessages(prev => [...prev, {
          id: `a-${Date.now()}`, role: 'assistant', error: true,
          text: json?.error ?? 'שגיאה בעיבוד השאלה.',
        }]);
      } else {
        setMessages(prev => [...prev, {
          id:    `a-${Date.now()}`,
          role:  'assistant',
          text:  json.answer ?? '',
          rows:  json.rows  ?? [],
          links: json.links ?? [],
        }]);
      }
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`, role: 'assistant', error: true,
        text: `שגיאת רשת: ${(e as Error).message}`,
      }]);
    } finally {
      setSending(false);
    }
  }, [sending]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter inserts newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* ── Floating launcher button ───────────────────────────────── */}
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
      </button>

      {/* ── Backdrop ─────────────────────────────────────────────── */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.45)',
            backdropFilter: 'blur(2px)', zIndex: 70,
          }}
        />
      )}

      {/* ── Drawer ────────────────────────────────────────────────── */}
      <aside
        role="dialog"
        aria-label="עוזר חכם"
        aria-hidden={!open}
        style={{
          position: 'fixed', top: 0, height: '100vh',
          insetInlineStart: 0,                        // RTL: visually right edge
          width: 'min(420px, 100vw)',
          backgroundColor: C.card,
          boxShadow: open ? '-8px 0 24px rgba(15,23,42,0.12)' : 'none',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          zIndex: 80, direction: 'rtl',
          display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 32, height: 32, borderRadius: 9, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: C.accentSub, color: C.accent, border: `1px solid ${C.accentRim}`,
            }}>
              <SparkleIcon size={16} />
            </span>
            <div>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: C.text }}>עוזר חכם</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: C.muted }}>שאלות תפעוליות בעברית</p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="סגור"
            style={{
              width: 30, height: 30, borderRadius: 7,
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: C.sub, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = C.bg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <CloseIcon />
          </button>
        </div>

        {/* Conversation area */}
        <div
          ref={scrollRef}
          style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', backgroundColor: C.bg }}
        >
          {messages.length === 0 ? (
            <EmptyState onPick={q => send(q)} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.map(m => <MessageBubble key={m.id} msg={m} onClose={() => setOpen(false)} />)}
              {sending && <ThinkingBubble />}
            </div>
          )}
        </div>

        {/* Composer */}
        <div style={{
          padding: '12px 16px', borderTop: `1px solid ${C.border}`,
          backgroundColor: C.card, flexShrink: 0,
        }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 8,
            border: `1px solid ${C.border}`, borderRadius: 12,
            padding: '8px 10px', backgroundColor: C.bg,
            transition: 'border-color 0.12s, box-shadow 0.12s',
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
                background: 'transparent', fontSize: 14, color: C.text,
                fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 120,
              }}
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || sending}
              aria-label="שליחה"
              style={{
                flexShrink: 0,
                width: 34, height: 34, borderRadius: 8, border: 'none',
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
            margin: '6px 4px 0', fontSize: 10.5, color: C.muted, textAlign: 'right',
          }}>
            הבוט קורא בלבד — לא מבצע שינויים.
          </p>
        </div>
      </aside>
    </>
  );
}

/* ── Empty state ─────────────────────────────────────────────────────── */

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div style={{ padding: '14px 0' }}>
      <div style={{
        backgroundColor: C.card, border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '16px 18px', marginBottom: 14,
      }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
          איך אפשר לעזור?
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: C.muted, lineHeight: 1.55 }}>
          אפשר לשאול בעברית טבעית — היום, מחר, יום שני, ושמות של מטופלות.
        </p>
      </div>
      <p style={{ fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 8px',
        textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        דוגמאות
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {EXAMPLES.map(q => (
          <button
            key={q}
            onClick={() => onPick(q)}
            style={{
              textAlign: 'right', padding: '10px 12px',
              backgroundColor: C.card, border: `1px solid ${C.border}`,
              borderRadius: 9, fontSize: 13, color: C.text, cursor: 'pointer',
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
        borderRadius: 12,
        borderEndStartRadius: !isUser ? 4 : 12,
        borderEndEndRadius:    isUser ? 4 : 12,
        padding: '10px 14px',
        fontSize: 13.5, lineHeight: 1.55,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        <p style={{ margin: 0 }}>{msg.text}</p>

        {msg.rows && msg.rows.length > 0 && (
          <div style={{
            marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {msg.rows.map((r, i) => (
              <RowLine key={i} row={r} onClose={onClose} />
            ))}
          </div>
        )}

        {msg.links && msg.links.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {msg.links.map((l, i) => (
              <Link
                key={i}
                href={l.href}
                onClick={onClose}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 18,
                  fontSize: 11.5, fontWeight: 600,
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
      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{row.title}</span>
      {row.subtitle && (
        <span style={{ fontSize: 11.5, color: C.muted, marginInlineStart: 0, display: 'block' }}>
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
          display: 'block', padding: '7px 10px', borderRadius: 7,
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
      padding: '7px 10px', borderRadius: 7,
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
        borderRadius: 12, borderEndStartRadius: 4,
        padding: '10px 14px',
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

function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function SendIcon({ size = 15 }: { size?: number }) {
  // Arrow points to the right in LTR; in RTL the natural read of the icon
  // is "send" regardless of direction since it's symmetric in intent.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}
