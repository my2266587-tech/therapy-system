'use client';

/**
 * Session-summary detail card.
 *
 * Shared between the summaries list (`app/summaries/page.tsx`) and the
 * patient detail's summaries tab (`app/patients/[id]/page.tsx`). The
 * design goal is *calm readability* — a clinician should be able to scan
 * the summary in seconds without the eye getting lost in dense form-style
 * sections. To that end:
 *
 *   - Warm cream surface (#FAF8F5) breaks the modal away from the
 *     standard white admin look.
 *   - The patient name is the dominant heading; date/time meta sits
 *     quietly below it; everything else is content.
 *   - Each section is its own white card with generous padding and a
 *     reading-friendly max-width. Important sections (נושאים עיקריים,
 *     התקדמות, צעדים הבאים) get a teal border-right accent so the eye
 *     finds them first.
 *   - Empty fields are dropped — never shown as "ריק / —", which is
 *     visual noise.
 *
 * The component is rendered inside a chromeless `<Modal size="2xl">` so
 * the close button below replaces the modal's default chrome button.
 */

import Link from 'next/link';
import DateDisplay from '@/components/ui/DateDisplay';
import { formatHebrew } from '@/lib/dateUtils';
import type { SessionSummary } from '@/types';

/* ── palette ───────────────────────────────────────────────────────── */

const C = {
  surface:        '#FAF8F5',  // warm cream — modal backdrop
  card:           '#FFFFFF',
  border:         '#ECE9E2',  // softer than the standard slate border
  borderStrong:   '#D9D5CB',
  text:           '#1F2937',
  heading:        '#0F172A',
  muted:          '#6B7280',
  micro:          '#94A3B8',
  accent:         '#0D9488',
  accentSoft:     '#F0FDF9',
  accentRim:      '#99F6E4',
};

/* ── highlighted sections (rendered with a teal accent rail) ──────── */

const HIGHLIGHT_KEYS = new Set<keyof SessionSummary>([
  'main_topics', 'progress', 'next_steps',
]);

interface SectionDef {
  key:   keyof SessionSummary;
  label: string;
}

const SECTIONS: SectionDef[] = [
  { key: 'main_topics',       label: 'נושאים עיקריים'   },
  { key: 'treatment_actions', label: 'מה עשינו בפגישה' },
  { key: 'current_state',     label: 'מצב נוכחי'         },
  { key: 'progress',          label: 'התקדמות'           },
  { key: 'next_steps',        label: 'צעדים הבאים'      },
  { key: 'tasks_given',       label: 'משימות שניתנו'    },
  { key: 'difficulties',      label: 'קשיים'             },
  { key: 'notes',             label: 'הערות'             },
];

/* ── public component ──────────────────────────────────────────────── */

export interface Props {
  summary:     SessionSummary;
  /** Patient's display name. Optional — when absent we fall back to
   *  `summary.patient?.full_name` (when the page joined it). */
  patientName?: string;
  patientHref?: string;
  onEdit?:      () => void;
  onClose:      () => void;
}

export default function SummaryDetailCard({
  summary, patientName, patientHref, onEdit, onClose,
}: Props) {
  const displayName =
    patientName ??
    ((summary as SessionSummary & { patient?: { full_name?: string } | null })
      .patient?.full_name) ??
    '—';

  const visible = SECTIONS
    .map(s => ({ ...s, value: summary[s.key] as string | null | undefined }))
    .filter(s => s.value && String(s.value).trim().length > 0);

  return (
    <article
      style={{
        backgroundColor: C.surface,
        direction: 'rtl',
        borderRadius: 20,
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      {/* ── Header ─────────────────────────────────────────────── */}
      <header style={{
        padding: '32px 36px 24px',
        backgroundColor: C.surface,
        borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 10px', borderRadius: 14,
              fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
              backgroundColor: C.accentSoft, color: C.accent,
              border: `1px solid ${C.accentRim}`,
              marginBottom: 12,
            }}>
              סיכום פגישה
            </span>

            {patientHref ? (
              <Link href={patientHref} onClick={onClose} style={{
                fontSize: 26, fontWeight: 700, color: C.heading,
                margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em',
                textDecoration: 'none', display: 'inline-block',
              }}>
                {displayName}
              </Link>
            ) : (
              <h2 style={{
                fontSize: 26, fontWeight: 700, color: C.heading,
                margin: 0, lineHeight: 1.2, letterSpacing: '-0.01em',
              }}>
                {displayName}
              </h2>
            )}

            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              marginTop: 8, flexWrap: 'wrap',
            }}>
              <DateDisplay date={summary.date} variant="compact" size="sm"
                muted={C.muted} strong={C.heading} />
              {summary.start_time && (
                <>
                  <Dot />
                  <span style={{
                    fontSize: 12.5, color: C.muted,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {summary.start_time}
                    {summary.end_time ? `–${summary.end_time}` : ''}
                  </span>
                </>
              )}
              {summary.duration_minutes && (
                <>
                  <Dot />
                  <span style={{ fontSize: 12.5, color: C.muted }}>
                    {summary.duration_minutes} דק׳
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Actions cluster */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {onEdit && (
              <button onClick={onEdit} style={iconBtnStyle(C)} title="ערוך סיכום" aria-label="ערוך סיכום">
                <PencilIcon />
              </button>
            )}
            <button onClick={onClose} style={iconBtnStyle(C)} title="סגור" aria-label="סגור">
              <CloseIcon />
            </button>
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div style={{ padding: '24px 36px 32px', backgroundColor: C.surface }}>
        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {visible.map(s => (
              <Section
                key={String(s.key)}
                label={s.label}
                value={String(s.value)}
                highlight={HIGHLIGHT_KEYS.has(s.key)}
              />
            ))}
          </div>
        )}

        {/* Hebrew calendar — quiet line at the bottom of the body */}
        <div style={{
          marginTop: 22, paddingTop: 16, borderTop: `1px dashed ${C.borderStrong}`,
          textAlign: 'center', fontSize: 11.5, color: C.micro, letterSpacing: '0.02em',
        }}>
          {formatHebrew(summary.date)}
        </div>
      </div>

      {/* ── Footer attachment ─────────────────────────────────── */}
      {summary.attachment_url && (
        <footer style={{
          padding: '18px 36px 28px',
          backgroundColor: C.surface,
          borderTop: `1px solid ${C.border}`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
            <a
              href={summary.attachment_url} target="_blank" rel="noreferrer"
              style={{
                padding: '12px 16px', borderRadius: 12,
                backgroundColor: C.card, border: `1px solid ${C.border}`,
                display: 'flex', alignItems: 'center', gap: 12,
                textDecoration: 'none',
                transition: 'border-color 0.12s, background-color 0.12s',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.accentRim;
                el.style.backgroundColor = C.accentSoft;
              }}
              onMouseLeave={e => {
                const el = e.currentTarget as HTMLElement;
                el.style.borderColor = C.border;
                el.style.backgroundColor = C.card;
              }}
            >
              <span style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: C.accentSoft, color: C.accent,
                border: `1px solid ${C.accentRim}`,
              }}>
                <FileIcon />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: C.muted, letterSpacing: '0.04em' }}>
                  קובץ מצורף
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: C.text, fontWeight: 500 }}>
                  פתח את הסיכום המקורי ←
                </p>
              </div>
            </a>
        </footer>
      )}
    </article>
  );
}

/* ── Section card ──────────────────────────────────────────────────── */

function Section({ label, value, highlight }: {
  label: string; value: string; highlight?: boolean;
}) {
  // Split the value into paragraphs the way clinicians actually wrote
  // them — blank-line separator → new <p>; single newlines kept inside
  // a paragraph so a bullet list stays together.
  const paragraphs = value
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  return (
    <section style={{
      padding: '20px 24px',
      backgroundColor: C.card,
      borderRadius: 14,
      border: `1px solid ${C.border}`,
      borderInlineEnd: highlight ? `3px solid ${C.accent}` : `1px solid ${C.border}`,
      boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        marginBottom: 10,
      }}>
        {highlight && (
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            backgroundColor: C.accent, display: 'inline-block',
          }} />
        )}
        <h3 style={{
          margin: 0,
          fontSize: 11.5, fontWeight: 700,
          color: highlight ? C.accent : C.muted,
          textTransform: 'uppercase', letterSpacing: '0.08em',
        }}>
          {label}
        </h3>
      </div>
      <div style={{ maxWidth: '68ch' }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{
            margin: i === 0 ? '0' : '12px 0 0',
            fontSize: 15,
            lineHeight: 1.75,
            color: C.text,
            fontWeight: 400,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {p}
          </p>
        ))}
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div style={{
      padding: '48px 24px', textAlign: 'center',
      backgroundColor: C.card, borderRadius: 14, border: `1px solid ${C.border}`,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: '50%', margin: '0 auto 12px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: C.accentSoft, border: `1px solid ${C.accentRim}`,
        color: C.accent, fontSize: 18,
      }}>
        ◌
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.heading }}>
        סיכום ריק
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.muted }}>
        אין תוכן רשום בסעיפי הסיכום.
      </p>
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden="true" style={{
      width: 3, height: 3, borderRadius: '50%',
      backgroundColor: C.borderStrong, display: 'inline-block',
    }} />
  );
}

/* ── Icon button ───────────────────────────────────────────────────── */

function iconBtnStyle(palette: typeof C): React.CSSProperties {
  return {
    width: 34, height: 34, borderRadius: 9,
    border: `1px solid ${palette.border}`,
    background: '#FFFFFFCC',
    color: palette.muted,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.12s',
  };
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6"  y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}
