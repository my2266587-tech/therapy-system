'use client';

import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { documentTypeLabels } from '@/lib/labels';
import type { DocumentType } from '@/types';

const TYPE_OPTIONS: { value: DocumentType; label: string }[] = [
  { value: 'personal_document',        label: documentTypeLabels.personal_document },
  { value: 'psychological_tracking',   label: documentTypeLabels.psychological_tracking },
  { value: 'session_summary_document', label: documentTypeLabels.session_summary_document },
  { value: 'other',                    label: documentTypeLabels.other },
];

interface Props {
  patientId: string;
  onSave: () => void;
  onCancel: () => void;
}

export default function DocumentUploadModal({ patientId, onSave, onCancel }: Props) {
  const [title,        setTitle]        = useState('');
  const [docType,      setDocType]      = useState<DocumentType>('personal_document');
  const [notes,        setNotes]        = useState('');
  const [file,         setFile]         = useState<File | null>(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [dragOver,     setDragOver]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(f: File | null) {
    setFile(f);
    // Auto-fill title from filename (strip extension)
    if (f && !title) {
      setTitle(f.name.replace(/\.[^.]+$/, ''));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file)  { setError('יש לבחור קובץ'); return; }
    if (!title) { setError('יש להזין שם מסמך'); return; }
    setSaving(true); setError('');

    try {
      const ts       = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const filePath = `documents/${patientId}/${ts}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { contentType: file.type, upsert: false });

      if (upErr) throw upErr;

      const { error: dbErr } = await supabase.from('patient_documents').insert({
        patient_id:    patientId,
        document_type: docType,
        title,
        file_url:      filePath,
        file_name:     file.name,
        uploaded_at:   new Date(ts).toISOString(),
        notes:         notes || null,
      });

      if (dbErr) throw dbErr;
      onSave();
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'שגיאה בהעלאת המסמך');
      setSaving(false);
    }
  }

  const labelBase = 'text-xs font-semibold text-slate-500 tracking-wide block mb-1.5';
  const inputBase = 'border border-slate-200 rounded-lg px-3 py-2.5 text-sm bg-white w-full focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-400 hover:border-slate-300 transition-colors placeholder:text-slate-300';

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
      )}

      {/* ── File drop zone ──────────────────────────────── */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFileChange(f);
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? 'border-teal-400 bg-teal-50'
            : file
            ? 'border-teal-300 bg-teal-50/60'
            : 'border-slate-200 hover:border-slate-300 bg-slate-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.xlsx,.xls,.txt"
          onChange={e => handleFileChange(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="space-y-1">
            <p className="text-sm font-semibold text-teal-700">📄 {file.name}</p>
            <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB · לחצי להחלפה</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-3xl">📂</p>
            <p className="text-sm font-medium text-slate-600">גרירה לכאן או לחיצה לבחירת קובץ</p>
            <p className="text-xs text-slate-400">PDF, Word, תמונות, Excel</p>
          </div>
        )}
      </div>

      {/* ── Fields ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelBase}>שם מסמך *</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
            placeholder="שם המסמך..."
            className={inputBase}
          />
        </div>

        <div>
          <label className={labelBase}>סוג מסמך</label>
          <select
            value={docType}
            onChange={e => setDocType(e.target.value as DocumentType)}
            className={`${inputBase} cursor-pointer`}
          >
            {TYPE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelBase}>הערות</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          placeholder="הערות נוספות..."
          className={`${inputBase} resize-none`}
        />
      </div>

      {/* ── Actions ─────────────────────────────────────── */}
      <div className="flex gap-3 pt-1">
        <button
          type="submit"
          disabled={saving || !file}
          className="px-6 py-2.5 bg-teal-700 text-white text-sm font-semibold rounded-lg hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          {saving && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
          {saving ? 'מעלה...' : 'העלה מסמך'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          ביטול
        </button>
      </div>
    </form>
  );
}
