'use client';

import { Suspense, useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import PatientForm from '@/components/patients/PatientForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import type { Patient } from '@/types';

const AVATAR_COLORS = [
  { bg: '#E6F7F5', text: '#0D9488', border: '#99F6E4' },
  { bg: '#EEF2FF', text: '#4F46E5', border: '#C7D2FE' },
  { bg: '#FEF9C3', text: '#A16207', border: '#FDE68A' },
  { bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' },
  { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' },
  { bg: '#FFF7ED', text: '#C2410C', border: '#FDBA74' },
];

const STATUS: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  active:   { label: 'פעילה',     bg: '#F0FDF9', text: '#0D9488', border: '#99F6E4', dot: '#0D9488' },
  inactive: { label: 'לא פעילה', bg: '#F8FAFC', text: '#64748B', border: '#E2E8F0', dot: '#CBD5E1' },
  waiting:  { label: 'ממתינה',    bg: '#FFFBEB', text: '#92400E', border: '#FDE68A', dot: '#F59E0B' },
};

function avatarColor(name: string) {
  return AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
}

const PATIENT_EXPORT_COLUMNS: Column<Patient>[] = [
  { header: 'שם מלא',  accessor: r => r.full_name, width: 24 },
  { header: 'טלפון',   accessor: r => r.phone ?? '', width: 16 },
  { header: 'אימייל',  accessor: r => r.email ?? '', width: 26 },
  { header: 'רכזת',    accessor: r => (r.coordinator as { full_name?: string } | null)?.full_name ?? '', width: 20 },
  { header: 'סטטוס',   accessor: r => STATUS[r.status]?.label ?? r.status, width: 14 },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2);
}

export default function PatientsPage() {
  return (
    <Suspense fallback={null}>
      <PatientsInner />
    </Suspense>
  );
}

function PatientsInner() {
  const router = useRouter();
  const sp     = useSearchParams();
  const statusFilter = sp.get('status') ?? 'all';

  const [records, setRecords] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<Patient | null>(null);
  const [search,  setSearch]  = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('patients')
      .select('*, coordinator:coordinator_id(full_name)')
      .order('full_name');
    setRecords((data ?? []) as Patient[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק את המטופלת? פעולה זו אינה ניתנת לביטול.')) return;
    await supabase.from('patients').delete().eq('id', id);
    load();
  }

  const filtered = records.filter(r => {
    const matchesSearch =
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (r.phone ?? '').includes(search);
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const STATUS_FILTERS = [
    { value: 'all',      label: 'הכל' },
    { value: 'active',   label: 'פעילות' },
    { value: 'waiting',  label: 'בהמתנה' },
    { value: 'inactive', label: 'לא פעילות' },
  ];

  return (
    <div style={{ backgroundColor: '#F6F8FB', minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              מטופלות
            </h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {loading ? '' : `${records.length} מטופלות במערכת`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<Patient>
              rows={filtered}
              columns={PATIENT_EXPORT_COLUMNS}
              title="מטופלות"
              fileBase="patients"
              disabled={loading}
            />
            <button
              onClick={() => { setEditing(null); setOpen(true); }}
              style={{
                backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
                borderRadius: 10, padding: '10px 20px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
                boxShadow: '0 2px 8px rgba(13,148,136,0.22)',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              + הוסף מטופלת
            </button>
          </div>
        </div>

        {/* ── Search + filter chips ── */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <input
            type="search"
            placeholder="חיפוש לפי שם או טלפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              border: '1px solid #E8ECF0', borderRadius: 9, padding: '9px 16px',
              fontSize: 14, backgroundColor: '#FFFFFF', color: '#1A2332',
              width: 260, outline: 'none', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              transition: 'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={e => {
              e.target.style.borderColor = '#0D9488';
              e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.09)';
            }}
            onBlur={e => {
              e.target.style.borderColor = '#E8ECF0';
              e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            {STATUS_FILTERS.map(f => (
              <FilterChip
                key={f.value}
                label={f.label}
                active={statusFilter === f.value}
                onClick={() => router.push(f.value === 'all' ? '/patients' : `/patients?status=${f.value}`)}
              />
            ))}
          </div>
        </div>

        {/* ── List ── */}
        {loading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState search={search} onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: 16,
            border: '1px solid #E8ECF0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            {filtered.map((r, i) => (
              <PatientRow
                key={r.id}
                patient={r}
                divider={i < filtered.length - 1}
                onEdit={() => { setEditing(r); setOpen(true); }}
                onDelete={() => handleDelete(r.id)}
              />
            ))}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: '#94A3B8',
              backgroundColor: '#F8FAFC', borderTop: '1px solid #F1F5F9',
            }}>
              {filtered.length} מטופלות{search && ` · תוצאות עבור "${search}"`}
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת מטופלת' : 'הוספת מטופלת'} size="xl">
        <PatientForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function PatientRow({ patient, divider, onEdit, onDelete }: {
  patient: Patient; divider: boolean; onEdit: () => void; onDelete: () => void;
}) {
  const router = useRouter();
  const col    = avatarColor(patient.full_name);
  const ini    = initials(patient.full_name);
  const st     = STATUS[patient.status] ?? STATUS.inactive;

  return (
    <div
      role="button"
      onClick={() => router.push(`/patients/${patient.id}`)}
      style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '14px 24px', cursor: 'pointer',
        borderBottom: divider ? '1px solid #F1F5F9' : 'none',
        transition: 'background-color 0.1s',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
    >
      {/* Avatar */}
      <div style={{
        width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
        backgroundColor: col.bg, border: `1.5px solid ${col.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700, color: col.text, letterSpacing: '0.03em',
      }}>
        {ini}
      </div>

      {/* Name + phone */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 600, color: '#1A2332', margin: 0, lineHeight: 1.3 }}>
          {patient.full_name}
        </p>
        {patient.phone && (
          <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0', direction: 'ltr', textAlign: 'right' }}>
            {patient.phone}
          </p>
        )}
      </div>

      {/* Coordinator */}
      {(patient.coordinator as any)?.full_name && (
        <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {(patient.coordinator as any).full_name}
        </span>
      )}

      {/* Status */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
        padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
        backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: st.dot, display: 'inline-block' }} />
        {st.label}
      </span>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
        <IconBtn onClick={onEdit}   icon={<PencilIcon />} hoverColor="#0D9488" title="ערוך" />
        <IconBtn onClick={onDelete} icon={<TrashIcon />}  hoverColor="#DC2626" title="מחק" />
      </div>
    </div>
  );
}


function ListSkeleton() {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
      {[1, 2, 3, 4, 5].map((i, idx) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px',
          borderBottom: idx < 4 ? '1px solid #F1F5F9' : 'none',
        }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: '35%', marginBottom: 7 }} />
            <div style={{ height: 10, backgroundColor: '#F8FAFC', borderRadius: 6, width: '20%' }} />
          </div>
          <div style={{ height: 22, width: 65, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ search, onAdd }: { search: string; onAdd: () => void }) {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0',
      padding: '52px 24px', textAlign: 'center',
    }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1A2332', margin: '0 0 6px' }}>
        {search ? 'לא נמצאו תוצאות' : 'אין מטופלות עדיין'}
      </p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>
        {search ? `לא נמצאו מטופלות עבור "${search}"` : 'התחילי בהוספת המטופלת הראשונה'}
      </p>
      {!search && (
        <button
          onClick={onAdd}
          style={{
            backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
            borderRadius: 9, padding: '10px 22px', fontSize: 14,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          + הוסף מטופלת
        </button>
      )}
    </div>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 14px', borderRadius: 20, fontSize: 13,
        fontWeight: active ? 600 : 500,
        color: active ? '#FFFFFF' : '#64748B',
        backgroundColor: active ? '#0D9488' : '#FFFFFF',
        border: `1px solid ${active ? '#0D9488' : '#E8ECF0'}`,
        cursor: 'pointer', transition: 'all 0.12s',
        boxShadow: active ? '0 2px 8px rgba(13,148,136,0.22)' : 'none',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = '#99F6E4';
          (e.currentTarget as HTMLElement).style.color = '#0D9488';
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.borderColor = '#E8ECF0';
          (e.currentTarget as HTMLElement).style.color = '#64748B';
        }
      }}
    >
      {label}
    </button>
  );
}
