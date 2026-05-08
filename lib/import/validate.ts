/**
 * The validation + dedup pipeline shared by /preview and /confirm.
 *
 * The pipeline is deterministic: same input bytes + same mapping → same
 * ValidatedRow[]. The /confirm endpoint runs the same code so the client
 * cannot inject arbitrary normalized values.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  TargetSpec, FieldSpec, RawSheet, ValidatedRow, PreviewResult, RowStatus,
} from './types';

/* ── Header → field auto-mapping ───────────────────────────────────── */

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

/* ── Type coercions ─────────────────────────────────────────────────── */

function coerceDate(raw: string): { ok: true; value: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'תאריך ריק' };

  // Already YYYY-MM-DD
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return { ok: false, reason: `תאריך לא תקין: ${s}` };
    return { ok: true, value: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` };
  }
  // DD/MM/YYYY  or  DD-MM-YYYY  or  DD.MM.YYYY
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

/* ── Lookup cache (avoid N queries for N rows) ─────────────────────── */

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
    staffByName.set(s.full_name.trim(), s.id);
  }
  const patientsByName = new Map<string, string>();
  for (const p of (patients.data ?? []) as Array<{ id: string; full_name: string }>) {
    patientsByName.set(p.full_name.trim(), p.id);
  }
  return { staffByName, patientsByName };
}

function resolveLookup(
  raw: string, field: FieldSpec, cache: LookupCache,
): { ok: true; value: string } | { ok: false; reason: string } {
  const s = raw.trim();
  if (!s) return { ok: false, reason: 'ערך ריק לחיפוש' };
  const map = field.lookup?.table === 'staff' ? cache.staffByName : cache.patientsByName;
  const id = map.get(s);
  if (!id) {
    // Try case-insensitive fallback
    for (const [k, v] of map) {
      if (k.toLowerCase() === s.toLowerCase()) return { ok: true, value: v };
    }
    return { ok: false, reason: `לא נמצא: "${s}"` };
  }
  return { ok: true, value: id };
}

/* ── Dedup against existing rows ───────────────────────────────────── */

async function fetchExistingForDedup(
  supabase: SupabaseClient,
  spec: TargetSpec,
): Promise<Array<{ id: string; values: Record<string, unknown> }>> {
  const cols = ['id', ...spec.dedupeKeys];
  const { data } = await supabase
    .from(spec.tableName)
    .select(cols.join(','));
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

/* ── Public: validateRows ──────────────────────────────────────────── */

export async function validateRows(
  supabase: SupabaseClient,
  spec:     TargetSpec,
  sheet:    RawSheet,
  mapping:  Record<string, string>,
): Promise<PreviewResult> {
  // Reverse mapping: field.key → original column index in the sheet
  const headerIndex = new Map<string, number>();
  sheet.headers.forEach((h, i) => headerIndex.set(h, i));
  const fieldToCol = new Map<string, number>();
  for (const [header, fieldKey] of Object.entries(mapping)) {
    const idx = headerIndex.get(header);
    if (idx != null) fieldToCol.set(fieldKey, idx);
  }

  const cache = await buildLookupCache(supabase);
  const existing = await fetchExistingForDedup(supabase, spec);
  const existingByKey = new Map<string, string>();
  for (const e of existing) {
    existingByKey.set(dedupKey(e.values, spec.dedupeKeys), e.id);
  }

  // Track in-batch duplicates (same row appearing twice in the same upload).
  const seenInBatch = new Set<string>();

  const validated: ValidatedRow[] = sheet.rows.map((row, i) => {
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

      if (coerced.ok) {
        values[field.key] = coerced.value;
      } else {
        errors.push(`${field.label}: ${coerced.reason}`);
        values[field.key] = null;
      }
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

    return {
      index: i + 2, // +2 = header row (1) + 1-based
      status,
      errors,
      warnings,
      values,
      duplicateOf,
    };
  });

  const summary = {
    total:      validated.length,
    valid:      validated.filter(r => r.status === 'valid').length,
    duplicates: validated.filter(r => r.status === 'duplicate').length,
    errors:     validated.filter(r => r.status === 'error').length,
    warnings:   validated.filter(r => r.warnings.length > 0).length,
  };

  return {
    target:           spec.key,
    headers:          sheet.headers,
    rows:             validated,
    suggestedMapping: autoMapHeaders(sheet.headers, spec),
    appliedMapping:   mapping,
    summary,
  };
}

/* ── Public: insertValidRows  (used by /confirm) ───────────────────── */

export async function insertValidRows(
  supabase: SupabaseClient,
  spec:     TargetSpec,
  preview:  PreviewResult,
): Promise<{ inserted: number; skipped: number; errors: { index: number; message: string }[] }> {
  const valid = preview.rows.filter(r => r.status === 'valid');
  if (valid.length === 0) return { inserted: 0, skipped: preview.rows.length, errors: [] };

  // Strip null values so the DB falls back to its column defaults instead
  // of overwriting (e.g. created_at default now()).
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
