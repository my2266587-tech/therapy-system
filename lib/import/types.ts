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
  /**
   * For 'lookup' — when the lookup misses, store the raw text in this
   * other column instead of failing the row. Lets us import a patient
   * even when "רכזת אחראית = רחל" doesn't match any staff record yet.
   */
  fallbackTextKey?: string;
  /**
   * For 'string' — maximum allowed length. A value above the cap, or any
   * value containing a newline, is flagged as a likely CSV-parse glitch
   * (paragraph spilling from a multi-line cell). Leave undefined for
   * genuinely multi-line fields like notes/details/main_topics.
   */
  maxLength?: number;
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
  /** Static values merged into every inserted row (e.g. role='coordinator'
   *  when importing through the dedicated coordinators target). */
  defaultValues?: Record<string, string | number | boolean>;
  /** When true, any unmapped non-empty cells get stashed as JSON in
   *  `import_metadata` instead of being silently dropped. Requires the
   *  table to have an `import_metadata jsonb` column. */
  captureUnmappedAsMetadata?: boolean;
  /**
   * Per-row post-processing hook. Runs AFTER per-field coercion but
   * BEFORE dedup. Lets a target derive missing fields from others
   * ("חודש חסר → חולץ מ-received_date"), normalize cross-field
   * inconsistencies, or apply business rules. Anything appended to
   * `fixes` shows up in the row's preview as a soft "תוקן אוטומטית"
   * badge — the row stays 'valid'.
   */
  postProcess?: (ctx: PostProcessContext) => void;
}

/** Context passed to TargetSpec.postProcess. Mutate `values` in place
 *  and push human-readable Hebrew descriptions to `fixes` / `warnings`. */
export interface PostProcessContext {
  values:   Record<string, string | number | boolean | null | Record<string, string>>;
  raw:      Map<string, string>;     // field.key → original cell text
  fixes:    string[];
  warnings: string[];
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
  /** Short, single-sentence Hebrew reason for non-valid rows.
   *  Examples: "חסר שם מטופלת", "תאריך לא תקין: 32/13/26",
   *  "לא נמצאה מטופלת בשם 'יוסי'", "שורה כפולה". */
  reason?: string;
  /** Per-field issues (the full list — `reason` is the headline). */
  errors: string[];
  /** Per-field non-blocking warnings. */
  warnings: string[];
  /** Hebrew descriptions of automatic corrections that ran on this row —
   *  e.g. "checked → כן", "חודש (2026-03) חולץ מתאריך הקבלה". The row
   *  remains 'valid' but the UI can show a soft "תוקן אוטומטית" badge. */
  fixes: string[];
  /** Normalized values keyed by field.key (these are what we'd insert).
   *  Includes synthetic columns (`import_metadata`, fallback text fields).
   *  Object values are JSON-encoded when sent to the DB. */
  values: Record<string, string | number | boolean | null | Record<string, string>>;
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
    /** Rows that were entirely blank in the source file and silently skipped. */
    empty:      number;
  };
  /** Headers from the source sheet that the user mapped to no field —
   *  surfaced so the mapping UI can warn "כותרת זו לא זוהתה". */
  unmappedHeaders: string[];
  /** Required fields with no header pointing at them — blocks the import. */
  missingRequired: { key: string; label: string }[];
}

export interface ConfirmResult {
  inserted: number;
  skipped:  number;
  errors:   { index: number; message: string }[];
}
