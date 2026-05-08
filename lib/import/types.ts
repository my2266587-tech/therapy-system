/**
 * Shared types for the import pipeline.
 *
 * The flow:
 *   1. parse uploaded file →  RawSheet { headers, rows }
 *   2. validate(rows, target, mapping) →  ValidatedRow[]
 *   3. confirm receives the same raw bytes + mapping, re-validates server-side,
 *      and inserts only rows whose status is 'valid'.
 */

export type FieldKind =
  | 'string'
  | 'number'
  | 'date'      // 'YYYY-MM-DD'
  | 'time'      // 'HH:MM' or 'HH:MM:SS'
  | 'boolean'
  | 'enum'
  | 'lookup';

export interface FieldSpec {
  /** Database column name. */
  key: string;
  /** Hebrew label shown in the UI and matched against incoming headers. */
  label: string;
  /** Header aliases (other Hebrew/English spellings the same column might have). */
  aliases?: string[];
  required?: boolean;
  kind: FieldKind;
  /** For 'enum' — accepted display values + the canonical DB value. */
  enumValues?: { value: string; labels: string[] }[];
  /** For 'lookup' — which table+column to search and which DB column to fill. */
  lookup?: {
    table:    'patients' | 'staff';
    matchOn:  'full_name' | 'email';
  };
  /** Help text shown next to the field in the mapping UI. */
  hint?: string;
}

export interface TargetSpec {
  /** URL slug, e.g. 'patients'. */
  key: string;
  /** Hebrew label, e.g. 'מטופלות'. */
  label: string;
  /** One-line description shown on the selector card. */
  description: string;
  tableName: string;
  fields: FieldSpec[];
  /** Rows are duplicates if all of these field keys match an existing row. */
  dedupeKeys: string[];
}

/* ── Raw + validated rows ────────────────────────────────────────────── */

export interface RawSheet {
  headers: string[];
  rows:    string[][];
}

export type RowStatus = 'valid' | 'duplicate' | 'error' | 'warning';

export interface ValidatedRow {
  /** 1-based row index in the original sheet (so error messages match Excel). */
  index: number;
  status: RowStatus;
  /** Per-field issues. */
  errors: string[];
  /** Per-field non-blocking warnings. */
  warnings: string[];
  /** Normalized values keyed by field.key (these are what we'd insert). */
  values: Record<string, string | number | boolean | null>;
  /** If duplicate — the existing row's id. */
  duplicateOf?: string;
}

export interface PreviewResult {
  target:           string;
  headers:          string[];
  rows:             ValidatedRow[];
  /** Auto-suggested mapping: header → field.key. */
  suggestedMapping: Record<string, string>;
  /** The mapping the server actually applied (may be the user's override). */
  appliedMapping:   Record<string, string>;
  summary: {
    total:      number;
    valid:      number;
    duplicates: number;
    errors:     number;
    warnings:   number;
  };
}

export interface ConfirmResult {
  inserted: number;
  skipped:  number;
  errors:   { index: number; message: string }[];
}
