'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Modal from '@/components/ui/Modal';
import ExpenseForm from '@/components/expenses/ExpenseForm';
import { IconBtn, PencilIcon, TrashIcon } from '@/components/ui/Icons';
import ExportButton, { type Column } from '@/components/ui/ExportButton';
import { hebrewDay } from '@/lib/dateUtils';
import type { PrivateExpense } from '@/types';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
  shadow: '0 1px 4px rgba(0,0,0,0.05)',
};

const EXPENSE_EXPORT_COLUMNS: Column<PrivateExpense>[] = [
  { header: 'תאריך',       accessor: r => r.date, width: 14 },
  { header: 'יום',         accessor: r => hebrewDay(r.date), width: 10 },
  { header: 'סוג טיפול',   accessor: r => r.treatment_type, width: 22 },
  { header: 'חומרים',      accessor: r => r.materials ?? '', width: 22 },
  { header: 'פרטים',       accessor: r => r.details ?? '', width: 30 },
  { header: 'מטופלת',      accessor: r => (r.patient as { full_name?: string } | null)?.full_name ?? '', width: 22 },
  { header: 'עלות (₪)',     accessor: r => Number(r.cost), width: 14 },
  { header: 'הערות',       accessor: r => r.notes ?? '', width: 24 },
];

export default function ExpensesPage() {
  const [records, setRecords] = useState<PrivateExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [open,    setOpen]    = useState(false);
  const [editing, setEditing] = useState<PrivateExpense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('private_expenses')
      .select('*, patient:patient_id(full_name)')
      .order('date', { ascending: false });
    setRecords((data ?? []) as PrivateExpense[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: string) {
    if (!confirm('האם למחוק הוצאה זו?')) return;
    await supabase.from('private_expenses').delete().eq('id', id);
    load();
  }

  const total = records.reduce((s, r) => s + Number(r.cost), 0);

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 3px', letterSpacing: '-0.3px' }}>
              הוצאות פרטיות
            </h1>
            <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
              {loading ? '' : `${records.length} הוצאות`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ExportButton<PrivateExpense>
              rows={records}
              columns={EXPENSE_EXPORT_COLUMNS}
              title="הוצאות פרטיות"
              fileBase="expenses"
              disabled={loading}
            />
            <button
              onClick={() => { setEditing(null); setOpen(true); }}
              style={{
                backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
                borderRadius: 10, padding: '10px 20px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
                boxShadow: `0 2px 8px rgba(13,148,136,0.22)`, transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
            >
              + הוסף הוצאה
            </button>
          </div>
        </div>

        {/* Total card */}
        {records.length > 0 && (
          <div style={{
            backgroundColor: C.card, borderRadius: 14,
            border: `1px solid #FDE68A`,
            boxShadow: `0 2px 10px rgba(245,158,11,0.08)`,
            padding: '20px 22px', marginBottom: 24,
            borderTop: `2px solid #F59E0B`,
          }}>
            <p style={{
              fontSize: 11, fontWeight: 600, color: '#92400E', margin: '0 0 10px',
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}>
              סה"כ הוצאות
            </p>
            <p style={{
              fontSize: 32, fontWeight: 700, margin: 0, lineHeight: 1,
              color: '#F59E0B',
            }}>
              ₪{total.toLocaleString('he-IL', { minimumFractionDigits: 2 })}
            </p>
          </div>
        )}

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : records.length === 0 ? (
          <EmptyState onAdd={() => { setEditing(null); setOpen(true); }} />
        ) : (
          <div style={{
            backgroundColor: C.card, borderRadius: 16,
            border: `1px solid ${C.border}`, boxShadow: C.shadow,
            overflow: 'hidden',
          }}>
            {records.map((r, i) => (
              <div
                key={r.id}
                onClick={() => { setEditing(r); setOpen(true); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 18,
                  padding: '16px 24px', cursor: 'pointer',
                  borderBottom: i < records.length - 1 ? `1px solid #F1F5F9` : 'none',
                  transition: 'background-color 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#F8FAFC'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = ''; }}
              >
                {/* Date badge */}
                <div style={{
                  minWidth: 54, textAlign: 'center', flexShrink: 0,
                  backgroundColor: '#F6F8FB', border: `1px solid ${C.border}`,
                  borderRadius: 10, padding: '8px 6px',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1 }}>
                    {new Date(r.date).getDate()}
                  </p>
                  <p style={{ fontSize: 10, color: C.muted, margin: '2px 0 0', textTransform: 'uppercase' }}>
                    {new Date(r.date).toLocaleDateString('he-IL', { month: 'short' })}
                  </p>
                  <p style={{ fontSize: 9, color: C.muted, margin: '2px 0 0', fontWeight: 500 }}>
                    {hebrewDay(r.date)}
                  </p>
                </div>

                {/* Treatment type + materials */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.3 }}>
                    {r.treatment_type}
                  </p>
                  <p style={{ fontSize: 12, color: C.muted, margin: '3px 0 0' }}>
                    {r.materials ?? '—'}
                    {r.details && ` · ${r.details.slice(0, 40)}${r.details.length > 40 ? '…' : ''}`}
                  </p>
                </div>

                {/* Patient */}
                {(r.patient as any)?.full_name && (
                  <span style={{ fontSize: 12, color: C.sub, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {(r.patient as any).full_name}
                  </span>
                )}

                {/* Cost */}
                <span style={{
                  fontSize: 15, fontWeight: 700, color: C.text,
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}>
                  ₪{Number(r.cost).toFixed(2)}
                </span>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
                  <IconBtn onClick={() => { setEditing(r); setOpen(true); }} icon={<PencilIcon />} hoverColor={C.accent} title="ערוך" />
                  <IconBtn onClick={() => handleDelete(r.id)} icon={<TrashIcon />} hoverColor="#DC2626" title="מחק" />
                </div>
              </div>
            ))}
            <div style={{
              padding: '10px 24px', fontSize: 12, color: C.muted,
              backgroundColor: '#F8FAFC', borderTop: `1px solid #F1F5F9`,
            }}>
              {records.length} הוצאות
            </div>
          </div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'עריכת הוצאה' : 'הוספת הוצאה'}>
        <ExpenseForm initial={editing} onSave={() => { setOpen(false); load(); }} onCancel={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
      {[1,2,3,4,5].map((i, idx) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 24px', borderBottom: idx < 4 ? `1px solid #F1F5F9` : 'none' }}>
          <div style={{ width: 54, height: 40, borderRadius: 10, backgroundColor: '#F1F5F9', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, backgroundColor: '#F1F5F9', borderRadius: 6, width: '25%', marginBottom: 8 }} />
            <div style={{ height: 11, backgroundColor: '#F8FAFC', borderRadius: 6, width: '30%' }} />
          </div>
          <div style={{ height: 14, width: 70, backgroundColor: '#F1F5F9', borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ backgroundColor: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: '52px 24px', textAlign: 'center' }}>
      <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: '0 0 6px' }}>אין הוצאות עדיין</p>
      <p style={{ fontSize: 13, color: C.muted, margin: '0 0 24px' }}>התחילי בהוספת ההוצאה הראשונה</p>
      <button
        onClick={onAdd}
        style={{
          backgroundColor: C.accent, color: '#FFFFFF', border: 'none',
          borderRadius: 9, padding: '10px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
        }}
      >
        + הוסף הוצאה
      </button>
    </div>
  );
}
