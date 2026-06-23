'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import StaffForm from '@/components/staff/StaffForm';
import { IconBtn, PencilIcon, TrashIcon, PauseIcon, PlayIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import SearchBar, { SearchEmpty } from '@/components/ui/SearchBar';
import { STAFF_ROLE_STYLE as ROLE_STYLE } from '@/lib/staffRoles';
import type { StaffMember } from '@/types';

const STAFF_EXPORT_COLUMNS: Column<StaffMember>[] = [
  { header: 'שם מלא', accessor: r => r.full_name, width: 24 },
  { header: 'תפקיד', accessor: r => ROLE_STYLE[r.role]?.label ?? r.role, width: 14 },
  { header: 'אימייל', accessor: r => r.email ?? '', width: 26 },
  { header: 'טלפון', accessor: r => r.phone ?? '', width: 16 },
  { header: 'הערות', accessor: r => r.notes ?? '', width: 30 },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? p[0][0] + p[1][0] : name.slice(0, 2);
}

export default function StaffPage() {
  const router = useRouter();
  const [records, setRecords] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState('');
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('staff').select('*').order('full_name');
    setRecords(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק איש צוות זה?')) return;
    await supabase.from('staff').delete().eq('id', id);
    load();
  }

  async function handleToggleActive(r: StaffMember) {
    const next = r.is_active === false;
    const msg = next
      ? `להחזיר את ${r.full_name} לפעילות?`
      : `להשהות את ${r.full_name}? הקישורים למטופלות, המסמכים והתיעוד הקיימים יישארו — היא רק תוסתר מבחירה חדשה.`;
    if (!confirm(msg)) return;
    await supabase.from('staff').update({ is_active: next }).eq('id', r.id);
    load();
  }

  const q = search.trim().toLowerCase();
  const searched = q === '' ? records : records.filter(r => {
    const haystack = [
      r.full_name, ROLE_STYLE[r.role]?.label ?? r.role, r.email, r.phone, r.notes,
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
  });
  // Suspended members stay visible but sink to the bottom of the list.
  const filtered = [...searched].sort((a, b) => {
    const aa = a.is_active === false ? 1 : 0;
    const bb = b.is_active === false ? 1 : 0;
    return aa - bb;
  });

  return (
    <div style={{ backgroundColor: '#F6F8FB', minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1A2332', margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              אנשי צוות
            </h1>
            <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>
              {loading ? '' : `${filtered.length} אנשי צוות${search.trim() && filtered.length !== records.length ? ` מתוך ${records.length}` : ''}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<StaffMember>
              rows={filtered}
              columns={STAFF_EXPORT_COLUMNS}
              title="אנשי צוות"
              fileBase="staff"
              disabled={loading}
            />
            <AddBtn onClick={() => { setEditing(null); setOpen(true); }} label="+ הוסף איש צוות" />
          </div>
        </div>

        {!loading && records.length > 0 && (
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="חיפוש חופשי — שם, תפקיד, אימייל, טלפון..."
          />
        )}

        {loading ? <ListSkeleton /> : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} label="אנשי צוות" />
        ) : filtered.length === 0 ? (
          <SearchEmpty query={search} onClear={() => setSearch('')} />
        ) : (
          <div style={{
            backgroundColor: '#FFFFFF', borderRadius: 16,
            border: '1px solid #E8ECF0', boxShadow: '0 1px 6px rgba(0,0,0,0.05)',
            overflow: 'hidden',
          }}>
            {filtered.map((r, i) => {
              const rs = ROLE_STYLE[r.role] ?? ROLE_STYLE.other;
              const suspended = r.is_active === false;
              return (
                <div
                  key={r.id}
                  onClick={() => router.push(`/staff/${r.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 16,
                    padding: '14px 24px', cursor: 'pointer',
                    borderBottom: i < filtered.length - 1 ? '1px solid #F1F5F9' : 'none',
                    transition: 'background-color 0.1s',
                    opacity: suspended ? 0.55 : 1,
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
                >
                  {/* Avatar */}
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%', flexShrink: 0,
                    backgroundColor: rs.av + '18', border: `1.5px solid ${rs.av}30`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: rs.av, letterSpacing: '0.03em',
                    filter: suspended ? 'grayscale(1)' : 'none',
                  }}>
                    {initials(r.full_name)}
                  </div>

                  {/* Name + email */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      fontSize: 15, fontWeight: 600, color: '#1A2332', margin: 0, lineHeight: 1.3,
                      textDecoration: suspended ? 'line-through' : 'none',
                    }}>
                      {r.full_name}
                    </p>
                    {(r.email || r.phone) && (
                      <p style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>
                        {r.email ?? r.phone}
                      </p>
                    )}
                  </div>

                  {/* Phone (if email shown above) */}
                  {r.email && r.phone && (
                    <span style={{ fontSize: 12, color: '#94A3B8', flexShrink: 0 }}>{r.phone}</span>
                  )}

                  {/* Suspended badge */}
                  {suspended && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                      padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                      backgroundColor: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA',
                    }}>
                      מושהית
                    </span>
                  )}

                  {/* Role badge */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', flexShrink: 0,
                    padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                    backgroundColor: rs.bg, color: rs.text, border: `1px solid ${rs.border}`,
                  }}>
                    {rs.label}
                  </span>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                    <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor="#0D9488" title="ערוך" />
                    {suspended ? (
                      <IconBtn onClick={() => handleToggleActive(r)} icon={<PlayIcon />} hoverColor="#0D9488" title="החזר לפעילות" />
                    ) : (
                      <IconBtn onClick={() => handleToggleActive(r)} icon={<PauseIcon />} hoverColor="#B45309" title="השהה" />
                    )}
                    <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                  </div>
                </div>
              );
            })}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: '#94A3B8',
              backgroundColor: '#F8FAFC', borderTop: '1px solid #F1F5F9',
            }}>
              {filtered.length} אנשי צוות
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת איש צוות' : 'הוספת איש צוות'}>
        <StaffForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} style={{
      backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none',
      borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
      cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.22)', transition: 'opacity 0.15s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
    >{label}</button>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', overflow: 'hidden' }}>
      {[1,2,3,4].map((i,idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 24px', borderBottom: idx < 3 ? '1px solid #F1F5F9' : 'none' }}>
          <div style={{ width: 42, height: 42, borderRadius: '50%', backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 13, backgroundColor: '#F1F5F9', borderRadius: 6, width: '30%', marginBottom: 7 }} />
            <div style={{ height: 10, backgroundColor: '#F8FAFC', borderRadius: 6, width: '20%' }} />
          </div>
          <div style={{ height: 22, width: 55, backgroundColor: '#F1F5F9', borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <div style={{ backgroundColor: '#FFFFFF', borderRadius: 16, border: '1px solid #E8ECF0', padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: '#1A2332', margin: '0 0 6px' }}>אין {label} עדיין</p>
      <p style={{ fontSize: 13, color: '#94A3B8', margin: '0 0 24px' }}>התחילי בהוספת הרשומה הראשונה</p>
      <button onClick={onAdd} style={{ backgroundColor: '#0D9488', color: '#FFFFFF', border: 'none', borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        + הוסף
      </button>
    </div>
  );
}
