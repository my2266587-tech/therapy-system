'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { TARGETS } from '@/lib/import/registry';
import type { PreviewResult, RawSheet, TargetSpec } from '@/lib/import/types';
import ImportTargetSelector from '@/components/import/ImportTargetSelector';
import ImportUploadZone     from '@/components/import/ImportUploadZone';
import ImportMappingTable   from '@/components/import/ImportMappingTable';
import ImportPreviewTable   from '@/components/import/ImportPreviewTable';
import ImportSummary        from '@/components/import/ImportSummary';

const C = {
  bg: '#F6F8FB', card: '#FFFFFF', border: '#E8ECF0',
  accent: '#0D9488', accentSub: '#F0FDF9', accentRim: '#99F6E4',
  text: '#1A2332', sub: '#64748B', muted: '#94A3B8',
};

type Step = 'target' | 'upload' | 'review' | 'done';
type StatusFilter = 'all' | 'valid' | 'duplicate' | 'error';

interface ConfirmOutcome {
  inserted: number;
  skipped:  number;
  errors:   { index: number; message: string }[];
}

export default function ImportPage() {
  const [step,        setStep]       = useState<Step>('target');
  const [targetKey,   setTargetKey]  = useState<string | null>(null);
  const [sheet,       setSheet]      = useState<RawSheet | null>(null);
  const [mapping,     setMapping]    = useState<Record<string, string>>({});
  const [preview,     setPreview]    = useState<PreviewResult | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [busy,        setBusy]       = useState(false);
  const [error,       setError]      = useState<string | null>(null);
  const [filter,      setFilter]     = useState<StatusFilter>('all');
  const [outcome,     setOutcome]    = useState<ConfirmOutcome | null>(null);

  // Auth bootstrap
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAccessToken(session?.access_token ?? null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setAccessToken(session?.access_token ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const target: TargetSpec | null = useMemo(
    () => TARGETS.find(t => t.key === targetKey) ?? null,
    [targetKey],
  );

  const targetCards = useMemo(() => TARGETS.map(t => ({
    key: t.key, label: t.label, description: t.description, fieldsCount: t.fields.length,
  })), []);

  /* ── Step transitions ──────────────────────────────────────────── */

  const reset = () => {
    setStep('target');
    setTargetKey(null);
    setSheet(null);
    setMapping({});
    setPreview(null);
    setError(null);
    setFilter('all');
    setOutcome(null);
  };

  const pickTarget = (key: string) => {
    setTargetKey(key);
    setStep('upload');
    setError(null);
  };

  const uploadFile = useCallback(async (file: File) => {
    if (!targetKey || !accessToken) {
      setError('יש להתחבר מחדש');
      return;
    }
    setBusy(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(`/api/import/${targetKey}/preview`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: fd,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בעיבוד הקובץ');
        return;
      }
      setSheet(json.rawSheet);
      setMapping(json.preview.appliedMapping);
      setPreview(json.preview);
      setStep('review');
    } catch (e) {
      setError(`שגיאת רשת: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [targetKey, accessToken]);

  const remapAndRevalidate = useCallback(async (nextMapping: Record<string, string>) => {
    if (!targetKey || !accessToken || !sheet) return;
    setMapping(nextMapping);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/${targetKey}/confirm`.replace('/confirm', '/preview'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: (() => {
          // Send the original sheet as a tiny xlsx is wasteful; use the
          // existing preview endpoint with a synthesized file. Cleaner:
          // just send a stripped-down "pseudo-file" via FormData. But
          // simpler: use confirm-preview convention — re-send raw sheet
          // via JSON to a new endpoint? We don't have one. So: we re-
          // upload using a CSV reconstruction.
          const csv = sheetToCSV(sheet);
          const blob = new Blob([csv], { type: 'text/csv' });
          const file = new File([blob], 'remap.csv', { type: 'text/csv' });
          const fd = new FormData();
          fd.append('file', file);
          fd.append('mapping', JSON.stringify(nextMapping));
          return fd;
        })(),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בעיבוד מחדש');
        return;
      }
      setPreview(json.preview);
    } finally {
      setBusy(false);
    }
  }, [targetKey, accessToken, sheet]);

  const confirmImport = useCallback(async () => {
    if (!targetKey || !accessToken || !sheet || !preview) return;
    if (preview.summary.valid === 0) {
      setError('אין שורות תקינות לייבוא');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/import/${targetKey}/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sheet, mapping }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error ?? 'שגיאה בייבוא');
        return;
      }
      setOutcome({
        inserted: json.inserted ?? 0,
        skipped:  json.skipped  ?? 0,
        errors:   json.errors   ?? [],
      });
      setStep('done');
    } catch (e) {
      setError(`שגיאת רשת: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [targetKey, accessToken, sheet, mapping, preview]);

  /* ── Render ────────────────────────────────────────────────────── */

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '36px 40px', direction: 'rtl' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: C.text, margin: '0 0 4px', letterSpacing: '-0.3px' }}>
            ייבוא נתונים
          </h1>
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>
            העלאת קובץ Excel/CSV עם תצוגה מקדימה לפני שמירה.
          </p>
        </div>

        <Stepper step={step} />

        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
            color: '#DC2626', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Step 1 — pick a target */}
        {step === 'target' && (
          <Section title="בחירת יעד ייבוא">
            <ImportTargetSelector
              targets={targetCards}
              selected={targetKey}
              onPick={pickTarget}
            />
          </Section>
        )}

        {/* Step 2 — upload */}
        {step === 'upload' && target && (
          <>
            <SelectedTargetBar target={target} onChange={() => { setStep('target'); setTargetKey(null); }} />
            <Section title="העלאת קובץ">
              <ImportUploadZone busy={busy} onFile={uploadFile} />
              <p style={{ fontSize: 12, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>
                שורת הכותרות חייבת להיות הראשונה בקובץ. שדות חובה
                של {target.label}:{' '}
                <strong style={{ color: C.text }}>
                  {target.fields.filter(f => f.required).map(f => f.label).join(' · ')}
                </strong>
                .
              </p>
            </Section>
          </>
        )}

        {/* Step 3 — review (mapping + preview + confirm) */}
        {step === 'review' && target && sheet && preview && (
          <>
            <SelectedTargetBar target={target} onChange={reset} />

            <Section title="מיפוי עמודות">
              <ImportMappingTable
                headers={sheet.headers}
                fields={target.fields.map(f => ({
                  key: f.key, label: f.label, required: !!f.required, hint: f.hint ?? null,
                }))}
                mapping={mapping}
                onChange={remapAndRevalidate}
              />
            </Section>

            <Section title="תצוגה מקדימה">
              <SummaryRow summary={preview.summary} filter={filter} onFilter={setFilter} />
              <ImportPreviewTable
                rows={preview.rows}
                fields={target.fields.map(f => ({ key: f.key, label: f.label }))}
                filter={filter === 'all' ? undefined : [filter]}
              />
            </Section>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
              <button
                onClick={reset}
                disabled={busy}
                style={{
                  padding: '10px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  backgroundColor: C.card, color: C.sub,
                  border: `1px solid ${C.border}`, cursor: busy ? 'wait' : 'pointer',
                }}
              >
                ביטול
              </button>
              <button
                onClick={confirmImport}
                disabled={busy || preview.summary.valid === 0}
                title={preview.summary.valid === 0 ? 'אין שורות תקינות לייבוא' : ''}
                style={{
                  padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 600,
                  backgroundColor: preview.summary.valid === 0 ? '#CBD5E1' : C.accent,
                  color: '#FFFFFF', border: 'none',
                  cursor: preview.summary.valid === 0 || busy ? 'not-allowed' : 'pointer',
                  boxShadow: preview.summary.valid === 0 ? 'none' : '0 2px 8px rgba(13,148,136,0.22)',
                }}
              >
                {busy ? 'מייבא...' : `אישור ייבוא · ${preview.summary.valid} שורות`}
              </button>
            </div>
          </>
        )}

        {/* Step 4 — done */}
        {step === 'done' && target && outcome && (
          <ImportSummary
            inserted={outcome.inserted}
            skipped={outcome.skipped}
            errors={outcome.errors}
            targetKey={target.key}
            targetLabel={target.label}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────────── */

function Stepper({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'target', label: 'בחירת יעד' },
    { key: 'upload', label: 'העלאה' },
    { key: 'review', label: 'תצוגה מקדימה' },
    { key: 'done',   label: 'סיכום' },
  ];
  const currentIdx = steps.findIndex(s => s.key === step);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22,
      flexWrap: 'wrap',
    }}>
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              padding: '6px 14px', borderRadius: 22, fontSize: 13,
              fontWeight: active ? 600 : 500,
              color:           active ? '#FFFFFF' : done ? C.accent : C.muted,
              backgroundColor: active ? C.accent  : done ? C.accentSub : C.card,
              border: `1px solid ${active ? C.accent : done ? C.accentRim : C.border}`,
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
                backgroundColor: active ? 'rgba(255,255,255,0.25)' : done ? C.accent : C.border,
                color: active ? '#FFFFFF' : done ? '#FFFFFF' : C.muted,
              }}>
                {done ? '✓' : i + 1}
              </span>
              {s.label}
            </div>
            {i < steps.length - 1 && (
              <span style={{ color: C.border, fontSize: 14, lineHeight: 1 }}>—</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{
        fontSize: 11, fontWeight: 600, color: C.muted, margin: '0 0 10px',
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function SelectedTargetBar({ target, onChange }: {
  target: TargetSpec; onChange: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', marginBottom: 18,
      backgroundColor: C.accentSub, border: `1px solid ${C.accentRim}`,
      borderRadius: 10,
    }}>
      <div>
        <p style={{ fontSize: 11, fontWeight: 600, color: C.accent, margin: '0 0 2px',
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          יעד נבחר
        </p>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, margin: 0 }}>
          {target.label}
        </p>
      </div>
      <button
        onClick={onChange}
        style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
          backgroundColor: C.card, color: C.accent,
          border: `1px solid ${C.accentRim}`, cursor: 'pointer',
        }}
      >
        החלפת יעד
      </button>
    </div>
  );
}

function SummaryRow({
  summary, filter, onFilter,
}: {
  summary: PreviewResult['summary'];
  filter:  StatusFilter;
  onFilter: (f: StatusFilter) => void;
}) {
  const chips: { key: StatusFilter; label: string; count: number; color: string }[] = [
    { key: 'all',       label: 'הכל',     count: summary.total,      color: C.text   },
    { key: 'valid',     label: 'תקין',    count: summary.valid,      color: '#16A34A' },
    { key: 'duplicate', label: 'כפול',    count: summary.duplicates, color: '#92400E' },
    { key: 'error',     label: 'שגיאה',   count: summary.errors,     color: '#DC2626' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {chips.map(c => {
        const active = filter === c.key;
        return (
          <button
            key={c.key}
            onClick={() => onFilter(c.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 18, fontSize: 12, fontWeight: 600,
              border: `1px solid ${active ? C.accent : C.border}`,
              backgroundColor: active ? C.accentSub : C.card,
              color: active ? C.accent : c.color,
              cursor: 'pointer',
            }}
          >
            {c.label}
            <span style={{
              minWidth: 22, padding: '0 6px', borderRadius: 10,
              backgroundColor: active ? C.accent : '#F1F5F9',
              color: active ? '#FFFFFF' : C.sub, fontSize: 11, fontWeight: 700,
              textAlign: 'center',
            }}>
              {c.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── helper: build a CSV from a RawSheet so we can re-upload after remap ── */

function sheetToCSV(sheet: RawSheet): string {
  const escape = (cell: string) => {
    const v = cell ?? '';
    if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
    return v;
  };
  const lines = [
    sheet.headers.map(escape).join(','),
    ...sheet.rows.map(r => r.map(escape).join(',')),
  ];
  return '﻿' + lines.join('\r\n');
}
