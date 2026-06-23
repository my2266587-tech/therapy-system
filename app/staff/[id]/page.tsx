'use client';

/**
 * Staff member detail page — same shell as /patients/[id]:
 *   - Hero with avatar + name + role badge + edit button
 *   - Tabs: פרטים | מטופלות | מסמכים
 *
 * Patients are linked through the staff_patients join table. Documents
 * live in staff_documents + the private `staff-documents` bucket. All
 * mutations go through /api/staff/[id]/* — never direct DB writes from
 * the client.
 */

import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import StaffForm from '@/components/staff/StaffForm';
import DocumentPreviewModal from '@/components/ui/DocumentPreviewModal';
import { STAFF_ROLE_STYLE } from '@/lib/staffRoles';
import { formatGregorian, PRESETS } from '@/lib/dateUtils';
import type { StaffMember, StaffDocumentWithUrl } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const TABS = ['פרטים', 'מטופלות', 'מסמכים'] as const;
type Tab = typeof TABS[number];

interface LinkedPatient {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  linked_at: string;
}

interface PatientOption { id: string; full_name: string; status: string }

const PATIENT_STATUS_HE: Record<string, string> = {
  active: 'פעילה', inactive: 'לא פעילה', waiting: 'ממתינה',
};

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2);
}

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [staff,    setStaff]    = useState<StaffMember | null>(null);
  const [patients, setPatients] = useState<LinkedPatient[]>([]);
  const [docs,     setDocs]     = useState<StaffDocumentWithUrl[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('פרטים');
  const [loading,   setLoading]   = useState(true);
  const [editOpen,  setEditOpen]  = useState(false);
  const [toggling,  setToggling]  = useState(false);

  const getToken = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const token = await getToken();
    const [s, pRes, dRes] = await Promise.all([
      supabase.from('staff').select('*').eq('id', id).single(),
      token
        ? fetch(`/api/staff/${id}/patients`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
      token
        ? fetch(`/api/staff/${id}/documents`, { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json()).catch(() => [])
        : Promise.resolve([]),
    ]);
    setStaff((s.data ?? null) as StaffMember | null);
    setPatients(Array.isArray(pRes) ? (pRes as LinkedPatient[]) : []);
    setDocs(Array.isArray(dRes) ? (dRes as StaffDocumentWithUrl[]) : []);
    setLoading(false);
  }, [id, getToken]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = useCallback(async () => {
    if (!staff) return;
    const next = staff.is_active === false;
    const msg = next
      ? `להחזיר את ${staff.full_name} לפעילות?`
      : `להשהות את ${staff.full_name}? הקישורים למטופלות, המסמכים והתיעוד הקיימים יישארו — היא רק תוסתר מבחירה חדשה.`;
    if (!window.confirm(msg)) return;
    setToggling(true);
    await supabase.from('staff').update({ is_active: next }).eq('id', staff.id);
    setToggling(false);
    load();
  }, [staff, load]);

  if (loading) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', direction: 'rtl' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            border: `2.5px solid ${C.accentRim}`, borderTopColor: C.accent,
            margin: '0 auto 12px', animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 13, color: C.muted }}>טוען איש צוות...</p>
        </div>
      </div>
    );
  }

  if (!staff) {
    return (
      <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: 40, direction: 'rtl' }}>
        <p style={{ color: C.sub }}>איש צוות לא נמצא.</p>
      </div>
    );
  }

  const rs = STAFF_ROLE_STYLE[staff.role] ?? STAFF_ROLE_STYLE.other;
  const suspended = staff.is_active === false;

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '32px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 22, color: C.muted }}>
          <Link href="/staff" style={{ color: C.accent, textDecoration: 'none', fontWeight: 500 }}>צוות</Link>
          <span>/</span>
          <span style={{ color: C.text, fontWeight: 500 }}>{staff.full_name}</span>
        </div>

        {/* Hero */}
        <div style={{
          backgroundColor: C.card, borderRadius: 18,
          border: `1px solid ${C.border}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
          padding: '28px 32px', marginBottom: 18,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16, flexShrink: 0,
                backgroundColor: rs.av + '18', border: `2px solid ${rs.av}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: rs.av, letterSpacing: '0.02em',
              }}>
                {initials(staff.full_name)}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
                    {staff.full_name}
                  </h1>
                  <span style={{
                    padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: rs.bg, color: rs.text, border: `1px solid ${rs.border}`,
                  }}>
                    {rs.label}
                  </span>
                  {suspended && (
                    <span style={{
                      padding: '3px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      backgroundColor: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA',
                    }}>
                      מושהית
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: C.sub }}>
                  {staff.phone && <span>{staff.phone}</span>}
                  {staff.email && <span>{staff.email}</span>}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={toggleActive}
                disabled={toggling}
                style={{
                  padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                  cursor: toggling ? 'wait' : 'pointer', transition: 'all 0.12s',
                  border: `1px solid ${suspended ? C.accentRim : '#FDE68A'}`,
                  color: suspended ? C.accent : '#B45309',
                  backgroundColor: suspended ? C.accentSub : '#FFFBEB',
                }}
              >
                {toggling ? '...' : suspended ? 'החזר לפעילות' : 'השהה'}
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
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 12, marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}`,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>{patients.length}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>מטופלות מקושרות</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, lineHeight: 1 }}>{docs.length}</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>מסמכים</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
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
            {activeTab === 'פרטים'   && <DetailsTab staff={staff} />}
            {activeTab === 'מטופלות' && <PatientsTab staffId={staff.id} linked={patients} onChange={load} getToken={getToken} />}
            {activeTab === 'מסמכים'  && <DocumentsTab staffId={staff.id} docs={docs} setDocs={setDocs} getToken={getToken} />}
          </div>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="עריכת איש צוות">
        <StaffForm
          initial={staff}
          onSave={() => { setEditOpen(false); load(); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>
    </div>
  );
}

/* ── Details tab ──────────────────────────────────────────────────── */

function DetailsTab({ staff }: { staff: StaffMember }) {
  const rs = STAFF_ROLE_STYLE[staff.role] ?? STAFF_ROLE_STYLE.other;
  const rows: [string, string | null | undefined][] = [
    ['שם מלא', staff.full_name],
    ['תפקיד',  rs.label],
    ['טלפון',  staff.phone],
    ['אימייל', staff.email],
  ];
  const visible = rows.filter(([, v]) => !!v);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {visible.map(([label, value]) => (
          <div key={label} style={{
            borderRadius: 10, padding: '14px 16px',
            backgroundColor: '#F8FAFC', border: `1px solid ${C.border}`,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 600, color: C.muted,
              letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 5,
            }}>
              {label}
            </div>
            <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{value}</div>
          </div>
        ))}
      </div>

      {staff.notes && staff.notes.trim() && (
        <div style={{
          marginTop: 14, borderRadius: 12, padding: '18px 20px',
          backgroundColor: '#FFFBEB', border: '1px solid #FDE68A',
          whiteSpace: 'pre-wrap', fontSize: 14, color: C.text, lineHeight: 1.6,
        }}>
          {staff.notes}
        </div>
      )}
    </div>
  );
}

/* ── Patients tab ─────────────────────────────────────────────────── */

function PatientsTab({
  staffId, linked, onChange, getToken,
}: {
  staffId: string;
  linked: LinkedPatient[];
  onChange: () => void;
  getToken: () => Promise<string | null>;
}) {
  const [allPatients, setAllPatients] = useState<PatientOption[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync selection with linked when picker opens
  useEffect(() => {
    if (pickerOpen) setSelectedIds(new Set(linked.map(p => p.id)));
  }, [pickerOpen, linked]);

  // Fetch all patients on first picker open
  useEffect(() => {
    if (!pickerOpen || allPatients.length > 0) return;
    supabase.from('patients').select('id, full_name, status')
      .order('full_name')
      .then(({ data }) => setAllPatients((data ?? []) as PatientOption[]));
  }, [pickerOpen, allPatients.length]);

  const filtered = search.trim()
    ? allPatients.filter(p => p.full_name.includes(search.trim()))
    : allPatients;

  async function save() {
    const token = await getToken();
    if (!token) { setError('יש להתחבר מחדש'); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/${staffId}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ patient_ids: [...selectedIds] }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בשמירה');
        return;
      }
      setPickerOpen(false);
      onChange();
    } catch (e) {
      setError(`שגיאת רשת: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  }

  async function unlink(patientId: string) {
    if (!window.confirm('להסיר את הקישור למטופלת?')) return;
    const token = await getToken();
    if (!token) return;
    const res = await fetch(`/api/staff/${staffId}/patients`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ patient_id: patientId }),
    });
    if (res.ok) onChange();
  }

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>מטופלות מקושרות</p>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
            {linked.length === 0 ? 'אין מטופלות מקושרות' : `${linked.length} מטופלות`}
          </p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
          }}
        >
          ניהול קישורים
        </button>
      </div>

      {linked.length === 0 ? (
        <div style={{
          padding: '32px 16px', textAlign: 'center',
          backgroundColor: '#F8FAFC', borderRadius: 12, border: `1px dashed #CBD5E1`,
          color: C.muted, fontSize: 13,
        }}>
          לא קושרו מטופלות לאיש צוות זה. לחצי על "ניהול קישורים" כדי להוסיף.
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {linked.map(p => {
            const stLabel = PATIENT_STATUS_HE[p.status] ?? p.status;
            return (
              <span key={p.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '7px 12px', borderRadius: 22,
                backgroundColor: '#FFFFFF', border: `1px solid ${C.border}`,
                fontSize: 13, color: C.text,
              }}>
                <Link
                  href={`/patients/${p.id}`}
                  style={{ color: C.text, textDecoration: 'none', fontWeight: 500 }}
                >
                  {p.full_name}
                </Link>
                <span style={{ fontSize: 11, color: C.muted }}>· {stLabel}</span>
                <button
                  onClick={() => unlink(p.id)}
                  title="הסר קישור"
                  style={{
                    width: 18, height: 18, borderRadius: '50%',
                    border: 'none', background: 'transparent',
                    color: C.muted, cursor: 'pointer', fontSize: 14, lineHeight: 1,
                    padding: 0,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#DC2626'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = C.muted; }}
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      <Modal open={pickerOpen} onClose={() => setPickerOpen(false)} title="קישור מטופלות לאיש צוות" size="lg">
        <div style={{ direction: 'rtl' }}>
          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 10, marginBottom: 12,
              backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
              color: '#DC2626', fontSize: 13,
            }}>
              {error}
            </div>
          )}
          <input
            type="search"
            placeholder="חיפוש..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              border: `1px solid ${C.border}`, borderRadius: 9, padding: '9px 14px',
              fontSize: 14, marginBottom: 12, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div style={{
            maxHeight: 360, overflowY: 'auto',
            border: `1px solid ${C.border}`, borderRadius: 10,
          }}>
            {filtered.length === 0 ? (
              <p style={{ padding: 16, textAlign: 'center', color: C.muted, margin: 0, fontSize: 13 }}>
                לא נמצאו מטופלות
              </p>
            ) : filtered.map((p, i) => {
              const checked = selectedIds.has(p.id);
              return (
                <label
                  key={p.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', cursor: 'pointer',
                    borderBottom: i < filtered.length - 1 ? `1px solid #F1F5F9` : 'none',
                    backgroundColor: checked ? C.accentSub : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={e => {
                      const next = new Set(selectedIds);
                      if (e.target.checked) next.add(p.id);
                      else                  next.delete(p.id);
                      setSelectedIds(next);
                    }}
                  />
                  <span style={{ flex: 1, fontSize: 14, color: C.text }}>{p.full_name}</span>
                  <span style={{ fontSize: 12, color: C.muted }}>
                    {PATIENT_STATUS_HE[p.status] ?? p.status}
                  </span>
                </label>
              );
            })}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16,
            paddingTop: 16, borderTop: `1px solid ${C.border}`,
          }}>
            <button
              onClick={() => setPickerOpen(false)}
              disabled={saving}
              style={{
                padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                color: C.sub, backgroundColor: C.card, border: `1px solid ${C.border}`,
                cursor: saving ? 'wait' : 'pointer',
              }}
            >
              ביטול
            </button>
            <button
              onClick={save}
              disabled={saving}
              style={{
                padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                color: '#FFFFFF', backgroundColor: C.accent, border: 'none',
                cursor: saving ? 'wait' : 'pointer',
                boxShadow: '0 2px 6px rgba(13,148,136,0.18)',
              }}
            >
              {saving ? 'שומר...' : `שמור · ${selectedIds.size}`}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ── Documents tab ────────────────────────────────────────────────── */

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
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentsTab({
  staffId, docs, setDocs, getToken,
}: {
  staffId: string;
  docs: StaffDocumentWithUrl[];
  setDocs: React.Dispatch<React.SetStateAction<StaffDocumentWithUrl[]>>;
  getToken: () => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<StaffDocumentWithUrl | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      const res = await fetch(`/api/staff/${staffId}/documents`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בהעלאה');
      } else {
        setDocs(prev => [json as StaffDocumentWithUrl, ...prev]);
      }
    } finally {
      setUploading(false);
    }
  }, [staffId, getToken, setDocs]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const f of Array.from(files)) {
      // eslint-disable-next-line no-await-in-loop
      await upload(f);
    }
  }, [upload]);

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const remove = useCallback(async (doc: StaffDocumentWithUrl) => {
    if (!window.confirm(`למחוק את "${doc.file_name}"? פעולה זו אינה הפיכה.`)) return;
    const token = await getToken();
    if (!token) return;
    setDeletingId(doc.id);
    setError(null);
    const res = await fetch(`/api/staff/${staffId}/documents/${doc.id}`, {
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
  }, [staffId, getToken, setDocs]);

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16,
      }}>
        <div>
          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: 0 }}>מסמכים</p>
          <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
            {docs.length} מסמכים
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600,
            cursor: uploading ? 'wait' : 'pointer',
            opacity: uploading ? 0.7 : 1,
            boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
          }}
        >
          {uploading ? 'מעלה...' : 'העלאת מסמך'}
        </button>
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
          backgroundColor: dragOver ? C.accentSub : '#F8FAFC',
          border: `2px dashed ${dragOver ? C.accentRim : '#CBD5E1'}`,
          cursor: 'pointer', transition: 'all 0.15s', marginBottom: docs.length ? 16 : 0,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 600, color: C.text, margin: '0 0 4px' }}>
          גררי קובץ לכאן או לחצי להעלאה
        </p>
        <p style={{ fontSize: 12, color: C.muted, margin: 0 }}>
          PDF · Word · תמונות · עד 10MB
        </p>
      </div>

      {docs.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {docs.map(doc => {
            const kind = fileKindLabel(doc.file_name, doc.mime_type);
            const kc = fileKindColors(kind);
            const isDeleting = deletingId === doc.id;
            return (
              <div key={doc.id} style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 14px', borderRadius: 10,
                backgroundColor: C.card, border: `1px solid ${C.border}`,
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
                    fontSize: 14, fontWeight: 500, color: C.text, margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {doc.file_name}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '2px 0 0' }}>
                    {formatGregorian(doc.uploaded_at, PRESETS.long)}
                    {doc.file_size != null && ` · ${formatBytes(doc.file_size)}`}
                  </p>
                </div>
                <button
                  onClick={() => { if (doc.url) setPreviewDoc(doc); }}
                  disabled={!doc.url}
                  title={doc.url ? 'פתיחה בתצוגת חלון בתוך המערכת' : ''}
                  style={{
                    flexShrink: 0, padding: '7px 12px', borderRadius: 8,
                    fontSize: 12, fontWeight: 600, color: C.accent,
                    backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
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
