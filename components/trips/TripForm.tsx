'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Field, TextareaField, SelectField } from '@/components/ui/FormField';
import { TRIP_TYPE_OPTIONS } from '@/lib/trips';
import type { Trip } from '@/types';
type PatientOpt = { id: string; full_name: string };

interface Props { initial: Trip | null; onSave: () => void; onCancel: () => void; }

export default function TripForm({ initial, onSave, onCancel }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    patient_id:   initial?.patient_id   ?? '',
    date:         initial?.date         ?? today,
    trip_type:    initial?.trip_type    ?? '',
    amount:       String(initial?.amount ?? ''),
    notes:        initial?.notes        ?? '',
    receipt_path: initial?.receipt_path ?? '',
    receipt_name: initial?.receipt_name ?? '',
  });
  const [patients, setPatients] = useState<PatientOpt[]>([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Receipt upload state. The path saved on the row when the form opened —
  // a replaced/removed old file is only deleted AFTER a successful save, and
  // a freshly-uploaded file is cleaned up if the form is cancelled.
  const initialReceiptPath = initial?.receipt_path ?? '';
  const [uploading,  setUploading]  = useState(false);
  const [receiptErr, setReceiptErr] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    supabase.from('patients').select('id, full_name').order('full_name').then(({ data }) => setPatients(data ?? []));
  }, []);

  function set(f: string, v: string) { setForm(p => ({ ...p, [f]: v })); }

  async function getToken(): Promise<string | null> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function deleteReceiptObject(path: string, token: string) {
    try {
      await fetch('/api/trips/delete-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ path }),
      });
    } catch {
      // Best-effort cleanup only.
    }
  }

  async function handlePickFile(file: File | null) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setReceiptErr('הקובץ גדול מ-10MB'); return; }
    setReceiptErr('');
    setUploading(true);
    try {
      const token = await getToken();
      if (!token) { setReceiptErr('יש להתחבר מחדש'); return; }
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/trips/upload-receipt', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setReceiptErr(json?.error ?? 'שגיאה בהעלאה'); return; }
      // Replacing a freshly-uploaded (not yet saved) file → drop the previous
      // storage object so it doesn't leak. The originally-saved file is only
      // removed after a successful save.
      if (form.receipt_path && form.receipt_path !== initialReceiptPath) {
        await deleteReceiptObject(form.receipt_path, token);
      }
      setForm(p => ({ ...p, receipt_path: json.path, receipt_name: json.name }));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleViewReceipt() {
    if (!form.receipt_path) return;
    const token = await getToken();
    if (!token) { setReceiptErr('יש להתחבר מחדש'); return; }
    try {
      const res = await fetch('/api/trips/sign-receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paths: [form.receipt_path] }),
      });
      const json = await res.json().catch(() => null);
      const url = json?.urls?.[form.receipt_path];
      if (url) window.open(url, '_blank', 'noopener');
      else setReceiptErr('לא ניתן לפתוח את הקבלה');
    } catch {
      setReceiptErr('לא ניתן לפתוח את הקבלה');
    }
  }

  async function handleRemoveReceipt() {
    if (!form.receipt_path) return;
    // A file uploaded in this session (not yet saved) is deleted right away;
    // the originally-saved file is deleted only after the save succeeds.
    if (form.receipt_path !== initialReceiptPath) {
      const token = await getToken();
      if (token) await deleteReceiptObject(form.receipt_path, token);
    }
    setForm(p => ({ ...p, receipt_path: '', receipt_name: '' }));
  }

  async function handleCancel() {
    // Clean up an orphan upload from this session.
    if (form.receipt_path && form.receipt_path !== initialReceiptPath) {
      const token = await getToken();
      if (token) await deleteReceiptObject(form.receipt_path, token);
    }
    onCancel();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.patient_id) { setError('יש לבחור מטופלת'); return; }
    if (!form.trip_type)  { setError('יש לבחור סוג נסיעה'); return; }
    setSaving(true); setError('');
    const payload = {
      patient_id:   form.patient_id,
      date:         form.date,
      trip_type:    form.trip_type,
      amount:       Number(form.amount),
      notes:        form.notes,
      receipt_path: form.receipt_path || null,
      receipt_name: form.receipt_name || null,
    };
    const { error: err } = initial?.id
      ? await supabase.from('trips').update(payload).eq('id', initial.id)
      : await supabase.from('trips').insert(payload);
    setSaving(false);
    if (err) { setError(err.message); return; }
    // The saved row no longer references the original file → remove it.
    if (initialReceiptPath && initialReceiptPath !== form.receipt_path) {
      const token = await getToken();
      if (token) await deleteReceiptObject(initialReceiptPath, token);
    }
    onSave();
  }

  const patientOptions = patients.map(p => ({ value: p.id, label: p.full_name }));

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField label="מטופלת *" value={form.patient_id} onChange={v => set('patient_id', v)} options={patientOptions} placeholder="בחרי מטופלת..." required />
        <Field label="תאריך *" type="date" value={form.date} onChange={v => set('date', v)} required />
        <SelectField label="סוג נסיעה *" value={form.trip_type} onChange={v => set('trip_type', v)} options={TRIP_TYPE_OPTIONS} placeholder="בחרי סוג..." required />
        <Field label="סכום (₪) *" type="number" value={form.amount} onChange={v => set('amount', v)} required />
      </div>
      <TextareaField label="הערות" value={form.notes} onChange={v => set('notes', v)} rows={2} />

      {/* Receipt (image / PDF) */}
      <div>
        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6, letterSpacing: '0.01em' }}>
          קבלה (תמונה או PDF)
        </span>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/*"
          style={{ display: 'none' }}
          onChange={e => handlePickFile(e.target.files?.[0] ?? null)}
        />
        {form.receipt_path ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
            padding: '9px 12px', borderRadius: 10,
            backgroundColor: '#F0FDF9', border: '1px solid #99F6E4',
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {form.receipt_name || 'קבלה מצורפת'}
            </span>
            <button type="button" onClick={handleViewReceipt} className="text-xs font-semibold text-teal-700 hover:underline">צפייה</button>
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">
              {uploading ? 'מעלה...' : 'החלפה'}
            </button>
            <button type="button" onClick={handleRemoveReceipt} disabled={uploading} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">הסרה</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              width: '100%', padding: '11px 12px', borderRadius: 10, cursor: uploading ? 'wait' : 'pointer',
              border: '1px dashed #CBD5E1', backgroundColor: '#F8FAFC',
              fontSize: 13, fontWeight: 600, color: '#64748B', fontFamily: 'inherit',
            }}
          >
            {uploading ? 'מעלה קבלה...' : '+ צירוף קבלה (תמונה או PDF, עד 10MB)'}
          </button>
        )}
        {receiptErr && <p style={{ fontSize: 12, color: '#DC2626', margin: '6px 0 0' }}>{receiptErr}</p>}
      </div>

      <div className="flex gap-3 pt-2 border-t border-slate-100">
        <button type="submit" disabled={saving || uploading} className="px-5 py-2 bg-teal-700 text-white text-sm font-medium rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors">
          {saving ? 'שומר...' : initial?.id ? 'עדכן' : 'הוסף'}
        </button>
        <button type="button" onClick={handleCancel} className="px-5 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">ביטול</button>
      </div>
    </form>
  );
}
