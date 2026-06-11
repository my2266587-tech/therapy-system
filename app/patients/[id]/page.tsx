'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import DateDisplay from '@/components/ui/DateDisplay';
import SummaryDetailCard from '@/components/summaries/SummaryDetailCard';
import PatientForm from '@/components/patients/PatientForm';
import PatientCardExportModal from '@/components/patients/PatientCardExportModal';
import DocumentPreviewModal from '@/components/ui/DocumentPreviewModal';
import {
  housingTypeLabels, maritalStatusLabels,
} from '@/lib/labels';
import { hebrewDay } from '@/lib/dateUtils';
import type {
  Patient, Session, SessionSummary, PatientDocumentWithUrl,
} from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const TABS = ['פרטים', 'פגישות', 'סיכומי פגישות', 'מסמכים', 'משימות', 'הערות'] as const;
type Tab = typeof TABS[number];

const STATUS_STYLE: Record<string, { label: string; bg: string; text: string; border: string }> = {
  active:     { label: 'פעילה',       bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4' },
  inactive:   { label: 'לא פעילה',    bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' },
  discharged: { label: 'שוחררה',      bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' },
  waitlist:   { label: 'רשימת המתנה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A' },
};

const SESSION_STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  planned:   { label: 'מתוכננת',  bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  completed: { label: 'הושלמה',   bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0', dot: '#16A34A' },
  cancelled: { label: 'בוטלה',    bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', dot: '#DC2626' },
  no_show:   { label: 'לא הגיעה', bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

const AVATAR_COLORS = ['#0D9488','#4F46E5','#9333EA','#0284C7','#059669','#D97706'];

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2);
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [patient,    setPatient]    = useState<Patient | null>(null);
  const [sessions,   setSessions]   = useState<Session[]>([]);
  const [summaries,  setSummaries]  = useState<SessionSummary[]>([]);
  const [linkedStaff, setLinkedStaff] = useState<Array<{ id: string; full_name: string; role: string }>>([]);
  const [activeTab,  setActiveTab]  = useState<Tab>('פרטים');
  const [loading,    setLoading]    = useState(true);
  const [editOpen,   setEditOpen]   = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [openSummary, setOpenSummary] = useState<SessionSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [p, s, sum, sp] = await Promise.all([
      supabase.from('patients').select('*, coordinator:coordinator_id(full_name), staff_member:staff_id(full_name)').eq('id', id).single(),
      supabase.from('sessions').select('*').eq('patient_id', id).order('date', { ascending: false }),
      supabase.from('session_summaries').select('*').eq('patient_id', id).order('date', { ascending: false }),
      // Reverse direction of staff_patients — show every staff member
      // explicitly linked to this patient so the relationship is visible
      // from both pages.
      supabase.from('staff_patients').select('staff:staff_id(id, full_name, role)').eq('patient_id', id),
    ]);
    setPatient(p.data as Patient);
    setSessions((s.data ?? []) as Session[]);

    // Resolve fresh signed URLs for any uploaded summary attachments so the
    // detail card can render a working "open file" link. Best-effort —
    // failure leaves the summaries visible without their attachment link.
    let summariesData = (sum.data ?? []) as SessionSummary[];
    const attachmentPaths = summariesData
      .map(r => r.attachment_path)
      .filter((p): p is string => !!p);
    if (attachmentPaths.length > 0) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token;
        if (token) {
          const res = await fetch('/api/summaries/sign-attachments', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ paths: attachmentPaths }),
          });
          if (res.ok) {
            const json = await res.json() as { urls: Record<string, string> };
            summariesData = summariesData.map(r =>
              r.attachment_path && json.urls[r.attachment_path]
                ? { ...r, attachment_url: json.urls[r.attachment_path] }
                : r
            );
          }
        }
      } catch {
        // Non-fatal.
      }
    }
    setSummaries(summariesData);
    type StaffJoin = { staff: { id: string; full_name: string; role: string } | null };
    const staffRows = ((sp.data ?? []) as unknown as StaffJoin[])
      .map(r => r.staff)
      .filter((s): s is NonNullable<typeof s> => s !== null);
    setLinkedStaff(staffRows);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  function handleSummaryChange(updated: SessionSummary) {
    setSummaries(rows => rows.map(row =>
      row.id === updated.id ? { ...row, ...updated } : row
    ));
    setOpenSummary(current =>
      current?.id === updated.id ? { ...current, ...updated } : current
    );
  }

  if (loading) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: `2.5px solid ${C.accentRim}`, borderTopColor: C.accent,
            margin: '0 auto 12px', animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 13, color: C.muted }}>טוען פרטי מטופלת...</p>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '40px', direction: 'rtl' }}>
        <p style={{ color: C.sub }}>מטופלת לא נמצאה.</p>
      </div>
    );
  }

  const color = avatarColor(patient.full_name);
  const ini   = initials(patient.full_name);
  const st    = STATUS_STYLE[patient.status] ?? STATUS_STYLE.inactive;

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '32px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 22, color: C.muted }}>
          <Link href="/patients" style={{ color: C.accent, textDecoration: 'none', fontWeight: 500 }}>מטופלות</Link>
          <span>/</span>
          <span style={{ color: C.text, fontWeight: 500 }}>{patient.full_name}</span>
        </div>

        {/* ── Hero ── */}
        <div style={{
          backgroundColor: C.card, borderRadius: 18,
          border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          padding: '28px 32px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, flexShrink: 0,
                backgroundColor: color + '18', border: `2px solid ${color}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color, letterSpacing: '0.02em',
              }}>
                {ini}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
                    {patient.full_name}
                  </h1>
                  <span style={{
                    padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
                  }}>
                    {st.label}
                  </span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: C.sub }}>
                  {patient.phone && <span>{patient.phone}</span>}
                  {patient.email && <span>{patient.email}</span>}
                  {patient.housing_type && <span>{housingTypeLabels[patient.housing_type]}</span>}
                  {(patient.coordinator as any)?.full_name && (
                    <span>רכזת: {(patient.coordinator as any).full_name}</span>
                  )}
                </div>
                {linkedStaff.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                    {linkedStaff.map(s => (
                      <Link
                        key={s.id}
                        href={`/staff/${s.id}`}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 14,
                          fontSize: 11.5, fontWeight: 500,
                          backgroundColor: '#F8FAFC', color: C.sub,
                          border: `1px solid ${C.border}`,
                          textDecoration: 'none',
                        }}
                      >
                        {s.full_name}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setExportOpen(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: 'none', color: '#FFFFFF', backgroundColor: C.accent,
                  cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
                  transition: 'opacity 0.12s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              >
                <DownloadIcon />
                הורדת כרטיס מטופלת
              </button>
              <button
                onClick={() => setEditOpen(true)}
                style={{
                  padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  border: `1px solid ${C.border}`, color: C.sub, backgroundColor: C.card,
                  cursor: 'pointer', transition: 'all 0.12s',
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
                  el.style.color = C.sub;
                }}
              >
                ערוך פרטים
              </button>
            </div>
          </div>

          {/* Mini stats */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`,
          }}>
            {[
              { label: 'פגישות',  value: sessions.length },
              { label: 'סיכומים', value: summaries.length },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={{
          backgroundColor: C.card, borderRadius: 16,
          border: `1px solid ${C.border}`, boxShadow: C.shadow, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', overflowX: 'auto',
            borderBottom: `1px solid ${C.border}`,
            backgroundColor: '#F8FAFC',
          }}>
            {TABS.map(tab => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '14px 20px', fontSize: 13, fontWeight: isActive ? 600 : 400,
                    color: isActive ? C.accent : C.sub,
                    backgroundColor: isActive ? C.card : 'transparent',
                    border: 'none', borderBottom: isActive ? `2px solid ${C.accent}` : '2px solid transparent',
                    cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.1s',
                    outline: 'none',
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>

          <div style={{ padding: '24px 28px' }}>
            {activeTab === 'פרטים'          && <DetailsTab patient={patient} />}
            {activeTab === 'פגישות'         && <SessionsTab sessions={sessions} />}
            {activeTab === 'סיכומי פגישות'  && <SummariesTab summaries={summaries} onOpen={setOpenSummary} />}
            {activeTab === 'מסמכים'         && <DocumentsTab patientId={patient.id} patientName={patient.full_name} />}
            {activeTab === 'משימות'         && <ComingSoon label="משימות" />}
            {activeTab === 'הערות'          && <NotesTab notes={patient.notes} />}
          </div>
        </div>

      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת פרטי מטופלת" size="xl">
        <PatientForm
          initial={patient}
          onSave={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <PatientCardExportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        patient={patient}
        linkedStaff={linkedStaff}
        sessions={sessions}
        summaries={summaries}
      />

      <Modal
        open={openSummary !== null}
        onClose={() => setOpenSummary(null)}
        title="סיכום פגישה"
        size="2xl"
        chromeless
      >
        {openSummary && (
          <SummaryDetailCard
            summary={openSummary}
            patientName={patient.full_name}
            onSummaryChange={handleSummaryChange}
            onClose={() => setOpenSummary(null)}
          />
        )}
      </Modal>
    </div>
  );
}

/* ── Tab components ── */

/**
 * Read-only patient summary, broken into sections so the clinician can
 * scan the whole record without opening the edit modal. Empty fields
 * are dropped — never shown as "—". An empty section disappears
 * entirely. Notes get a 4-line clamp with a "הצג עוד / הצג פחות"
 * toggle so a long history doesn't dominate the tab.
 */
function DetailsTab({ patient }: { patient: Patient }) {
  // FK-resolved name wins over the import fallback text. When the FK
  // is null but the text was set by the importer, surface it with a
  // small "לא מקושר" hint so the user knows it's not a real linkage.
  const coordinatorDisplay = patient.coordinator?.full_name
    ? { value: patient.coordinator.full_name, linked: true }
    : patient.coordinator_name
      ? { value: patient.coordinator_name, linked: false }
      : null;

  const guideDisplay = patient.staff_member?.full_name
    ? { value: patient.staff_member.full_name, linked: true }
    : patient.guide_name
      ? { value: patient.guide_name, linked: false }
      : null;

  const family: { label: string; value: string | null }[] = [
    { label: 'שם אבא',       value: patient.father_name },
    { label: 'שם אמא',       value: patient.mother_name },
    { label: 'מצב משפחתי',
      value: patient.marital_status
        ? (maritalStatusLabels[patient.marital_status] ?? patient.marital_status)
        : null },
    { label: 'מיקום במשפחה', value: patient.family_position },
  ];

  const team: { label: string; value: React.ReactNode | null }[] = [
    { label: 'רכזת אחראית',
      value: coordinatorDisplay
        ? <NameWithHint text={coordinatorDisplay.value} hint={coordinatorDisplay.linked ? null : 'לא מקושר'} />
        : null },
    { label: 'איש צוות אחראי',
      value: guideDisplay
        ? <NameWithHint text={guideDisplay.value} hint={guideDisplay.linked ? null : 'לא מקושר'} />
        : null },
    { label: 'צוות',          value: patient.team_name },
  ];

  const contact: { label: string; value: string | null }[] = [
    { label: 'טלפון', value: patient.phone },
    { label: 'אימייל', value: patient.email },
  ];

  const housing: { label: string; value: string | null }[] = [
    { label: 'סוג דירה',
      value: patient.housing_type ? housingTypeLabels[patient.housing_type] : null },
    { label: 'כתובת דירה',   value: patient.apartment_address },
    { label: 'כתובת מגורים', value: patient.home_address },
  ];

  // Surface anything the importer stashed but the schema doesn't model
  // (e.g. ת"ז, תאריך לידה) so it's not invisible.
  const extras: { label: string; value: string | null }[] =
    Object.entries(patient.import_metadata ?? {})
      .filter(([, v]) => typeof v === 'string' && v.trim().length > 0)
      .map(([label, value]) => ({ label, value: String(value) }));

  const sections: { title: string; rows: { label: string; value: React.ReactNode | null }[] }[] = [
    { title: 'פרטי קשר',          rows: contact },
    { title: 'פרטי משפחה',         rows: family },
    { title: 'שיוך לצוות',         rows: team },
    { title: 'כתובות ודיור',       rows: housing },
    ...(extras.length ? [{ title: 'פרטים נוספים', rows: extras }] : []),
  ];

  const visibleSections = sections
    .map(s => ({ ...s, rows: s.rows.filter(r => !!r.value) }))
    .filter(s => s.rows.length > 0);

  const hasNotes = !!patient.notes && patient.notes.trim().length > 0;

  if (visibleSections.length === 0 && !hasNotes) {
    return <Empty msg="אין פרטים להצגה" />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {visibleSections.map(s => (
        <DetailSection key={s.title} title={s.title} rows={s.rows} />
      ))}

      {hasNotes && <NotesPreview text={patient.notes!} />}
    </div>
  );
}

function DetailSection({
  title, rows,
}: {
  title: string;
  rows: { label: string; value: React.ReactNode | null }[];
}) {
  return (
    <section style={{
      backgroundColor: '#FFFFFF', borderRadius: 12,
      border: '1px solid #E8ECF0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
      padding: '18px 20px',
    }}>
      <h3 style={{
        margin: '0 0 14px', fontSize: 11, fontWeight: 700, color: '#0D9488',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {title}
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: 10,
      }}>
        {rows.map(r => (
          <div key={r.label} style={{
            borderRadius: 10, padding: '12px 14px',
            backgroundColor: '#F8FAFC', border: '1px solid #ECF0F4',
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: '#94A3B8',
              letterSpacing: '0.06em', textTransform: 'uppercase',
              marginBottom: 5,
            }}>
              {r.label}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 500, color: '#1A2332', lineHeight: 1.45,
              wordBreak: 'break-word',
            }}>
              {r.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function NameWithHint({ text, hint }: { text: string; hint: string | null }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {text}
      {hint && (
        <span style={{
          fontSize: 10.5, fontWeight: 600, color: '#92400E',
          backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
          padding: '1px 6px', borderRadius: 10, lineHeight: 1.3,
        }}>
          {hint}
        </span>
      )}
    </span>
  );
}

function NotesPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  // Show the toggle only if the content actually overflows. Cheap proxy:
  // long char count or a multi-paragraph note.
  const isLong = text.length > 240 || (text.match(/\n/g)?.length ?? 0) >= 4;

  return (
    <section style={{
      backgroundColor: '#FFFFFF', borderRadius: 12,
      border: '1px solid #E8ECF0', boxShadow: '0 1px 2px rgba(15,23,42,0.03)',
      padding: '18px 20px',
      borderInlineEnd: '3px solid #FBBF24',
    }}>
      <h3 style={{
        margin: '0 0 12px', fontSize: 11, fontWeight: 700, color: '#92400E',
        letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        הערות
      </h3>
      <div style={{
        fontSize: 14, color: '#1A2332', lineHeight: 1.65,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        ...(isLong && !expanded ? {
          display: '-webkit-box',
          WebkitLineClamp: 4,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        } : null),
      }}>
        {text}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            marginTop: 10, padding: 0, background: 'none', border: 'none',
            color: '#0D9488', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          {expanded ? '← הצג פחות' : 'הצג עוד →'}
        </button>
      )}
    </section>
  );
}

function SessionsTab({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return <Empty msg="אין פגישות רשומות" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sessions.map(s => {
        const st = SESSION_STATUS[s.status] ?? SESSION_STATUS.planned;
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '12px 16px', borderRadius: 10,
            backgroundColor: '#F8FAFC', border: '1px solid #E8ECF0',
          }}>
            <div style={{
              minWidth: 46, textAlign: 'center', flexShrink: 0,
              backgroundColor: '#FFFFFF', border: '1px solid #E8ECF0',
              borderRadius: 8, padding: '5px 4px',
            }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1A2332', margin: 0, lineHeight: 1 }}>
                {new Date(s.date).getDate()}
              </p>
              <p style={{ fontSize: 9, color: '#94A3B8', margin: '2px 0 0', textTransform: 'uppercase' }}>
                {new Date(s.date).toLocaleDateString('he-IL', { month: 'short' })}
              </p>
              <p style={{ fontSize: 8, color: '#94A3B8', margin: '1px 0 0', fontWeight: 500 }}>
                {hebrewDay(s.date)}
              </p>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 500, color: '#1A2332', margin: 0 }}>
                {s.start_time} – {s.end_time}
                {s.duration_minutes ? ` · ${s.duration_minutes} דק'` : ''}
              </p>
              {s.notes && (
                <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>{s.notes}</p>
              )}
            </div>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
              backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`, flexShrink: 0,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: st.dot, display: 'inline-block' }} />
              {st.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SummariesTab({ summaries, onOpen }: { summaries: SessionSummary[]; onOpen: (s: SessionSummary) => void }) {
  if (summaries.length === 0) return <Empty msg="אין סיכומים רשומים" />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {summaries.map(s => (
        <div
          key={s.id}
          onClick={() => onOpen(s)}
          style={{
            borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
            border: `1px solid #E8ECF0`, borderRight: `3px solid #0D9488`,
            backgroundColor: '#FAFCFF', transition: 'all 0.12s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.backgroundColor = '#F0FDF9';
            e.currentTarget.style.borderColor = '#99F6E4';
            e.currentTarget.style.borderRightColor = '#0D9488';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(13,148,136,0.08)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.backgroundColor = '#FAFCFF';
            e.currentTarget.style.borderColor = '#E8ECF0';
            e.currentTarget.style.borderRightColor = '#0D9488';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
              <DateDisplay date={s.date} size="md" strong="#1A2332" muted="#64748B" />
              {(s.start_time || s.duration_minutes) && (
                <span style={{ fontSize: 12, color: '#94A3B8', alignSelf: 'center' }}>
                  {s.start_time ? `${s.start_time}${s.end_time ? ` – ${s.end_time}` : ''}` : ''}
                  {s.start_time && s.duration_minutes ? ' · ' : ''}
                  {s.duration_minutes ? `${s.duration_minutes} דק'` : ''}
                </span>
              )}
            </div>
            <span style={{
              fontSize: 11, fontWeight: 500, color: '#0D9488',
              padding: '2px 8px', borderRadius: 12,
              backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
            }}>
              פתח →
            </span>
          </div>
          {s.main_topics && (
            <p style={{ fontSize: 13, color: '#64748B', margin: '0 0 4px', lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>נושאים: </span>
              {s.main_topics.slice(0, 100)}{s.main_topics.length > 100 ? '…' : ''}
            </p>
          )}
          {!s.main_topics && s.treatment_actions && (
            <p style={{ fontSize: 13, color: '#64748B', margin: 0, lineHeight: 1.5 }}>
              <span style={{ fontWeight: 600, color: '#1A2332' }}>מה עשינו: </span>
              {s.treatment_actions.slice(0, 100)}{s.treatment_actions.length > 100 ? '…' : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

/* SummaryDetail moved to components/summaries/SummaryDetailCard.tsx —
 * shared with the summaries list page. */

function MetaItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

const ACCEPT_ATTR =
  '.pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp,.heic,.heif,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'image/*';

function fileKindLabel(name: string, mime: string | null): string {
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext === 'pdf' || mime === 'application/pdf') return 'PDF';
  if (ext === 'doc' || ext === 'docx' || (mime && mime.includes('word'))) return 'Word';
  if (mime && mime.startsWith('image/')) return 'תמונה';
  if (['jpg','jpeg','png','gif','webp','heic','heif'].includes(ext)) return 'תמונה';
  return ext ? ext.toUpperCase() : 'קובץ';
}

function fileKindColors(kind: string): { bg: string; text: string; border: string } {
  if (kind === 'PDF')    return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' };
  if (kind === 'Word')   return { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' };
  if (kind === 'תמונה') return { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' };
  return { bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0' };
}

function formatBytes(n: number | null): string {
  if (!n && n !== 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const DOC_EXPORT_COLUMNS: Column<PatientDocumentWithUrl>[] = [
  { header: 'שם הקובץ',  accessor: r => r.file_name, width: 32 },
  { header: 'סוג',        accessor: r => fileKindLabel(r.file_name, r.mime_type), width: 12 },
  { header: 'תאריך עלייה', accessor: r => r.uploaded_at ? new Date(r.uploaded_at) : '', width: 16 },
  { header: 'גודל',       accessor: r => formatBytes(r.file_size), width: 12 },
  { header: 'סוג MIME',   accessor: r => r.mime_type ?? '', width: 24 },
];

function DocumentsTab({ patientId, patientName }: { patientId: string; patientName: string }) {
  const [docs, setDocs]         = useState<PatientDocumentWithUrl[]>([]);
  const [loading, setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<PatientDocumentWithUrl | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    const token = await getToken();
    if (!token) { setLoading(false); setError('יש להתחבר מחדש'); return; }
    const res = await fetch(`/api/patients/${patientId}/documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? 'שגיאה בטעינת מסמכים');
      setLoading(false);
      return;
    }
    setDocs(json as PatientDocumentWithUrl[]);
    setLoading(false);
  }, [patientId, getToken]);

  useEffect(() => { refresh(); }, [refresh]);

  const upload = useCallback(async (file: File) => {
    setError(null);
    if (file.size > 10 * 1024 * 1024) {
      setError('הקובץ גדול מ-10MB');
      return;
    }
    const token = await getToken();
    if (!token) { setError('יש להתחבר מחדש'); return; }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`/api/patients/${patientId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בהעלאה');
      } else {
        setDocs(prev => [json as PatientDocumentWithUrl, ...prev]);
      }
    } finally {
      setUploading(false);
    }
  }, [patientId, getToken]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      // sequential — easier error UX, and avoids hammering the function
      // eslint-disable-next-line no-await-in-loop
      await upload(f);
    }
  }, [upload]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const remove = useCallback(async (doc: PatientDocumentWithUrl) => {
    if (!window.confirm(`למחוק את "${doc.file_name}"? פעולה זו אינה הפיכה.`)) return;
    const token = await getToken();
    if (!token) { setError('יש להתחבר מחדש'); return; }
    setDeletingId(doc.id);
    setError(null);
    const res = await fetch(`/api/patients/${patientId}/documents/${doc.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setError(json?.error ?? 'שגיאה במחיקה');
    } else {
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    }
    setDeletingId(null);
  }, [patientId, getToken]);

  return (
    <div>
      {/* Upload header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', margin: 0 }}>מסמכים</p>
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '2px 0 0' }}>
            {loading ? 'טוען...' : `${docs.length} מסמכים`}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ExportButton<PatientDocumentWithUrl>
            rows={docs}
            columns={DOC_EXPORT_COLUMNS}
            title={`מסמכים – ${patientName}`}
            fileBase={`patient-documents-${patientId.slice(0, 8)}`}
            disabled={loading}
          />
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
              borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600,
              cursor: uploading ? 'wait' : 'pointer',
              opacity: uploading ? 0.7 : 1,
              boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => { if (!uploading) (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
            onMouseLeave={e => { if (!uploading) (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          >
            <UploadIcon />
            {uploading ? 'מעלה...' : 'העלאת מסמך'}
          </button>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        style={{ display: 'none' }}
        onChange={e => {
          handleFiles(e.target.files);
          if (inputRef.current) inputRef.current.value = '';
        }}
      />

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: 10, marginBottom: 12,
          backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
          color: '#DC2626', fontSize: 13,
        }}>
          {error}
        </div>
      )}

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          borderRadius: 14, padding: '32px 24px', textAlign: 'center',
          backgroundColor: dragOver ? '#F0FDF9' : '#F8FAFC',
          border: `2px dashed ${dragOver ? '#99F6E4' : '#CBD5E1'}`,
          cursor: 'pointer', transition: 'all 0.15s', marginBottom: docs.length ? 16 : 0,
        }}
      >
        <div style={{
          width: 48, height: 48, borderRadius: 12, margin: '0 auto 12px',
          backgroundColor: '#FFFFFF', border: '1px solid #E8ECF0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#0D9488',
        }}>
          <UploadIcon size={20} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', margin: '0 0 4px' }}>
          גררי קובץ לכאן או לחצי להעלאה
        </p>
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>
          PDF · Word · תמונות · עד 10MB
        </p>
      </div>

      {/* Documents list */}
      {!loading && docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(doc => {
            const kind = fileKindLabel(doc.file_name, doc.mime_type);
            const kc = fileKindColors(kind);
            const isDeleting = deletingId === doc.id;
            return (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px', borderRadius: 10,
                backgroundColor: '#FFFFFF', border: '1px solid #E8ECF0',
                opacity: isDeleting ? 0.5 : 1,
              }}>
                <span style={{
                  flexShrink: 0, minWidth: 48, textAlign: 'center',
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
                  backgroundColor: kc.bg, color: kc.text, border: `1px solid ${kc.border}`,
                }}>
                  {kind}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    fontSize: 14, fontWeight: 500, color: '#1A2332', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {doc.file_name}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
                    <DateDisplay date={doc.uploaded_at} size="sm" />
                    {doc.file_size != null && (
                      <span style={{ fontSize: 11, color: '#94A3B8', alignSelf: 'center' }}>
                        · {formatBytes(doc.file_size)}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => { if (doc.url) setPreviewDoc(doc); }}
                  disabled={!doc.url}
                  title={doc.url ? 'פתיחה בתצוגת חלון בתוך המערכת' : ''}
                  style={{
                    flexShrink: 0, padding: '7px 12px', borderRadius: 8,
                    fontSize: 12, fontWeight: 600, color: '#0D9488',
                    backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
                    cursor: doc.url ? 'pointer' : 'not-allowed',
                  }}
                >
                  פתח
                </button>
                <button
                  onClick={() => remove(doc)}
                  disabled={isDeleting}
                  style={{
                    flexShrink: 0, padding: '7px 12px', borderRadius: 8,
                    fontSize: 12, fontWeight: 600, color: '#DC2626',
                    backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
                    cursor: isDeleting ? 'wait' : 'pointer',
                  }}
                >
                  {isDeleting ? '...' : 'מחיקה'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && docs.length === 0 && !error && (
        <p style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', margin: '8px 0 0' }}>
          עדיין לא הועלו מסמכים
        </p>
      )}

      <DocumentPreviewModal
        open={previewDoc !== null}
        onClose={() => setPreviewDoc(null)}
        url={previewDoc?.url ?? ''}
        fileName={previewDoc?.file_name ?? ''}
        mimeType={previewDoc?.mime_type ?? null}
      />
    </div>
  );
}

function NotesTab({ notes }: { notes: string | null }) {
  if (!notes || !notes.trim()) return <Empty msg="אין הערות" />;
  return (
    <div style={{
      borderRadius: 12, padding: '18px 20px',
      backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
      whiteSpace: 'pre-wrap', fontSize: 14, color: '#1A2332', lineHeight: 1.6,
    }}>
      {notes}
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div style={{
        width: 44, height: 44, borderRadius: 12, margin: '0 auto 12px',
        backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, color: '#0D9488',
      }}>
        ◌
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', margin: '0 0 4px' }}>
        {label} — בקרוב
      </p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>פיצ'ר זה יתווסף בגרסה הבאה</p>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div style={{ padding: '40px 0', textAlign: 'center' }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%', margin: '0 auto 10px',
        backgroundColor: '#F0FDF9', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color: '#0D9488',
      }}>
        ◌
      </div>
      <p style={{ fontSize: 13, color: '#94A3B8' }}>{msg}</p>
    </div>
  );
}

function UploadIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="17 8 12 3 7 8"/>
      <line x1="12" y1="3" x2="12" y2="15"/>
    </svg>
  );
}

function DownloadIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}
