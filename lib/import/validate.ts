/**
 * Validation + dedup pipeline for /preview and /confirm.
 *
 * Pipeline order:
 *   1. rewriteSheet  — combine "שם פרטי" + "שם משפחה" into a synthesized
 *                      "שם מלא" column when there's no full-name column.
 *   2. autoMapHeaders — match each header to a target field by label/aliases
 *                       (case- and punctuation-insensitive).
 *   3. drop entirely-empty rows (counted, not flagged as errors).
 *   4. coerce per-field types (date, time, number, enum, lookup, …).
 *   5. dedup against the DB and within the batch.
 *   6. attach a single human-readable `reason` to each non-valid row.
 *
 * /confirm runs the same pipeline so the client cannot tamper with
 * normalized values.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TargetSpec, FieldSpec, RawSheet, ValidatedRow, PreviewResult, RowStatus,
} from './types';

/* ── 1. sheet rewrite (split-name auto-combine) ─────────────────────── */

const FIRST_NAME_RE = /^(?:שם\s*פרטי|first[\s_-]?name|firstname|fname|given[\s_-]?name)$/i;
const LAST_NAME_RE  = /^(?:שם\s*משפחה|last[\s_-]?name|lastname|surname|family[\s_-]?name|lname)$/i;
const FULL_NAME_RE  = /^(?:שם\s*מלא|שם\s*המטופלת|שם\s*המטופל|full[\s_-]?name|fullname|name)$/i;

function rewriteSheet(sheet: RawSheet): RawSheet {
  const trimHeaders = sheet.headers.map(h => h.trim());
  const firstIdx = trimHeaders.findIndex(h => FIRST_NAME_RE.test(h));
  const lastIdx  = trimHeaders.findIndex(h => LAST_NAME_RE.test(h));
  const fullIdx  = trimHeaders.findIndex(h => FULL_NAME_RE.test(h));

  // Only synthesize when first+last exist AND there is no full-name column.
  if (firstIdx < 0 || lastIdx < 0 || fullIdx >= 0) return sheet;

  return {
    headers: [...sheet.headers, 'שם מלא'],
    rows: sheet.rows.map(r => {
      const first = (r[firstIdx] ?? '').trim();
      const last  = (r[lastIdx]  ?? '').trim();
      return [...r, [first, last].filter(Boolean).join(' ')];
    }),
  };
}

/* ── 2. header auto-mapping ─────────────────────────────────────────── */

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[״׳"'.\-_\s]+/g, '');
}

export function autoMapHeaders(
  headers: string[],
  spec: TargetSpec,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) {
    const norm = normalizeHeader(h);
    if (!norm) continue;
    for (const f of spec.fields) {
      const candidates = [f.label, f.key, ...(f.aliases ?? [])];
      if (candidates.some(c => normalizeHeader(c) === norm)) {
        // First match wins — earlier headers take precedence.
        if (!Object.values(out).includes(f.key)) out[h] = f.key;
        break;
      }
    }
  }
  return out;
}

/* ── 3. empty-row detection ─────────────────────────────────────────── */

function isRowEmpty(row: string[]): boolean {
  return row.every(c => c == null || String(c).trim() === '');
}

/* ── 4. type coercions ──────────────────────────────────────────────── */

function coerceDate(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'תאריך ריק' };

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { ok: false, reason: `תאריך לא תקין: ${s}` };
    return { ok: true, value: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const d = +m[1], mo = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { ok: false, reason: `תאריך לא תקין: ${s}` };
    return { ok: true, value: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }
  return { ok: false, reason: `פורמט תאריך לא מוכר: ${s}` };
}

function coerceTime(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'שעה ריקה' };
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return { ok: false, reason: `פורמט שעה לא מוכר: ${s}` };
  const h = +m[1], mi = +m[2], se = m[3] ? +m[3] : 0;
  if (h > 23 || mi > 59 || se > 59) return { ok: false, reason: `שעה לא תקינה: ${s}` };
  return { ok: true, value: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(se).padStart(2, '0')}` };
}

function coerceNumber(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  const s = raw.trim().replace(/[,\s]/g, '').replace(/^₪/, '');
  if (!s) return { ok: false, reason: 'מספר ריק' };
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, reason: `לא מספר: ${raw}` };
  return { ok: true, value: n };
}

function coerceBoolean(raw: string): { ok: true; value: boolean } | { ok: false; reason: string } {
  const s = raw.trim().toLowerCase();
  if (['1', 'true', 'yes', 'כן', 'שולם', '✓', 'v'].includes(s))    return { ok: true, value: true };
  if (['0', 'false', 'no', 'לא', 'טרם', 'x', '', '-'].includes(s)) return { ok: true, value: false };
  return { ok: false, reason: `ערך בוליאני לא ברור: ${raw}` };
}

function coerceEnum(raw: string, field: FieldSpec): { ok: true; value: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'ערך ריק' };
  for (const ev of field.enumValues ?? []) {
    if (ev.value === s || ev.labels.some(l => l.trim() === s)) {
      return { ok: true, value: ev.value };
    }
  }
  const allowed = (field.enumValues ?? []).map(v => v.labels[0]).join(', ');
  return { ok: false, reason: `ערך לא חוקי "${s}". מותר: ${allowed}` };
}

/* ── 5. lookup cache ────────────────────────────────────────────────── */

interface LookupCache {
  staffByName:    Map<string, string>;
  patientsByName: Map<string, string>;
}

async function buildLookupCache(supabase: SupabaseClient): Promise<LookupCache> {
  const [staff, patients] = await Promise.all([
    supabase.from('staff').select('id, full_name'),
    supabase.from('patients').select('id, full_name'),
  ]);
  const staffByName = new Map<string, string>();
  for (const s of (staff.data ?? []) as Array<{ id: string; full_name: string }>) {
    staffByName.set(s.full_name.trim().toLowerCase(), s.id);
  }
  const patientsByName = new Map<string, string>();
  for (const p of (patients.data ?? []) as Array<{ id: string; full_name: string }>) {
    patientsByName.set(p.full_name.trim().toLowerCase(), p.id);
  }
  return { staffByName, patientsByName };
}

function resolveLookup(
  raw: string, field: FieldSpec, cache: LookupCache,
): { ok: true; value: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'ערך ריק לחיפוש' };
  const map = field.lookup?.table === 'staff' ? cache.staffByName : cache.patientsByName;
  const id = map.get(s.toLowerCase());
  if (!id) {
    const what = field.lookup?.table === 'staff' ? 'איש צוות' : 'מטופלת';
    return { ok: false, reason: `לא נמצא${field.lookup?.table === 'staff' ? '' : 'ה'} ${what} בשם "${s}"` };
  }
  return { ok: true, value: id };
}

/* ── 6. dedup ───────────────────────────────────────────────────────── */

async function fetchExistingForDedup(
  supabase: SupabaseClient, spec: TargetSpec,
): Promise<Array<{ id: string; values: Record<string, unknown> }>> {
  const cols = ['id', ...spec.dedupeKeys];
  const { data } = await supabase.from(spec.tableName).select(cols.join(','));
  return ((data ?? []) as unknown as Array<Record<string, unknown> & { id: string }>).map(r => {
    const values: Record<string, unknown> = {};
    for (const k of spec.dedupeKeys) values[k] = r[k];
    return { id: r.id, values };
  });
}

function dedupKey(values: Record<string, unknown>, keys: string[]): string {
  return keys.map(k => {
    const v = values[k];
    return v == null ? '' : String(v).trim().toLowerCase();
  }).join('||');
}

/* ── 7. headline reason builder ─────────────────────────────────────── */

function summarizeReason(errors: string[], status: RowStatus): string | undefined {
  if (status === 'valid')     return undefined;
  if (status === 'duplicate') return 'שורה כפולה — קיימת כבר במערכת';
  if (errors.length === 0)    return undefined;
  // Headline = first error, polished a bit
  const first = errors[0];
  // Common case: "חסר: שדה" → flatten to "חסר <שדה>"
  return first.replace(/^חסר:\s*/, 'חסר ');
}

/* ── 8. main entry — validateRows ───────────────────────────────────── */

export async function validateRows(
  supabase: SupabaseClient,
  spec:     TargetSpec,
  inputSheet: RawSheet,
  mapping:  Record<string, string>,
): Promise<PreviewResult> {
  // Step 1: synthesize "שם מלא" from "שם פרטי" + "שם משפחה" if needed.
  const sheet = rewriteSheet(inputSheet);

  // If we just appended a "שם מלא" column the mapping doesn't yet know
  // about it — auto-route it to full_name when full_name has no mapping.
  if (sheet.headers.length > inputSheet.headers.length) {
    const synthHeader = sheet.headers[sheet.headers.length - 1];
    const fullField   = spec.fields.find(f => /full_name|^name$/.test(f.key));
    if (fullField && !Object.values(mapping).includes(fullField.key)) {
      mapping = { ...mapping, [synthHeader]: fullField.key };
    }
  }

  // Step 2: build header→column index, field→column index.
  const headerIndex = new Map<string, number>();
  sheet.headers.forEach((h, i) => headerIndex.set(h, i));
  const fieldToCol = new Map<string, number>();
  for (const [header, fieldKey] of Object.entries(mapping)) {
    const idx = headerIndex.get(header);
    if (idx != null) fieldToCol.set(fieldKey, idx);
  }

  // Step 3: caches.
  const cache    = await buildLookupCache(supabase);
  const existing = await fetchExistingForDedup(supabase, spec);
  const existingByKey = new Map<string, string>();
  for (const e of existing) {
    existingByKey.set(dedupKey(e.values, spec.dedupeKeys), e.id);
  }
  const seenInBatch = new Set<string>();

  // Step 4: per-row work.
  let emptySkipped = 0;
  const validated: ValidatedRow[] = [];

  sheet.rows.forEach((row, i) => {
    if (isRowEmpty(row)) { emptySkipped++; return; }

    const errors:   string[] = [];
    const warnings: string[] = [];
    const values:   Record<string, string | number | boolean | null> = {};

    for (const field of spec.fields) {
      const col = fieldToCol.get(field.key);
      const raw = col != null ? (row[col] ?? '').toString() : '';

      if (!raw.trim()) {
        if (field.required) errors.push(`חסר: ${field.label}`);
        values[field.key] = null;
        continue;
      }

      let coerced: { ok: true; value: string | number | boolean } | { ok: false; reason: string };
      switch (field.kind) {
        case 'date':    coerced = coerceDate(raw); break;
        case 'time':    coerced = coerceTime(raw); break;
        case 'number':  coerced = coerceNumber(raw); break;
        case 'boolean': coerced = coerceBoolean(raw); break;
        case 'enum':    coerced = coerceEnum(raw, field); break;
        case 'lookup':  coerced = resolveLookup(raw, field, cache); break;
        case 'string':
        default:        coerced = { ok: true, value: raw.trim() }; break;
      }

      if (coerced.ok) values[field.key] = coerced.value;
      else { errors.push(`${field.label}: ${coerced.reason}`); values[field.key] = null; }
    }

    let status: RowStatus = errors.length > 0 ? 'error' : 'valid';
    let duplicateOf: string | undefined;

    if (status === 'valid') {
      const key = dedupKey(values, spec.dedupeKeys);
      if (key.replace(/\|/g, '').length === 0) {
        warnings.push('אין מפתח לבדיקת כפילות');
      } else if (existingByKey.has(key)) {
        status = 'duplicate';
        duplicateOf = existingByKey.get(key);
      } else if (seenInBatch.has(key)) {
        status = 'duplicate';
        warnings.push('שורה זהה הופיעה כבר באותו קובץ');
      } else {
        seenInBatch.add(key);
      }
    }

    validated.push({
      index: i + 2, // +2 = header row + 1-based
      status,
      reason: summarizeReason(errors, status),
      errors, warnings, values, duplicateOf,
    });
  });

  // Step 5: mapping diagnostics.
  const mappedHeaders     = new Set(Object.keys(mapping));
  const unmappedHeaders   = sheet.headers
    .filter(h => h.trim() && !mappedHeaders.has(h));

  const usedFields        = new Set(Object.values(mapping));
  const missingRequired   = spec.fields
    .filter(f => f.required && !usedFields.has(f.key))
    .map(f => ({ key: f.key, label: f.label }));

  const summary = {
    total:      validated.length,
    valid:      validated.filter(r => r.status === 'valid').length,
    duplicates: validated.filter(r => r.status === 'duplicate').length,
    errors:     validated.filter(r => r.status === 'error').length,
    warnings:   validated.filter(r => r.warnings.length > 0).length,
    empty:      emptySkipped,
  };

  return {
    target:           spec.key,
    headers:          sheet.headers,
    rows:             validated,
    suggestedMapping: autoMapHeaders(sheet.headers, spec),
    appliedMapping:   mapping,
    summary,
    unmappedHeaders,
    missingRequired,
  };
}

/* ── 9. insert (used by /confirm) ──────────────────────────────────── */

export async function insertValidRows(
  supabase: SupabaseClient,
  spec:     TargetSpec,
  preview:  PreviewResult,
): Promise<{ inserted: number; skipped: number; errors: { index: number; message: string }[] }> {
  const valid = preview.rows.filter(r => r.status === 'valid');
  if (valid.length === 0) return { inserted: 0, skipped: preview.rows.length, errors: [] };

  const payload = valid.map(r => {
    const obj: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r.values)) {
      if (v != null) obj[k] = v;
    }
    return obj;
  });

  const { error, data } = await supabase
    .from(spec.tableName)
    .insert(payload)
    .select('id');

  if (error) {
    return {
      inserted: 0,
      skipped:  preview.rows.length,
      errors:   [{ index: 0, message: error.message }],
    };
  }

  return {
    inserted: data?.length ?? valid.length,
    skipped:  preview.rows.length - (data?.length ?? valid.length),
    errors:   [],
  };
}
