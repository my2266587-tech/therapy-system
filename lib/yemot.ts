/**
 * Server-side helper for talking to Yemot Mashiach's file API.
 *
 *   downloadFile(path) fetches a file from the system via
 *   https://www.call2all.co.il/ym/api/DownloadFile and returns it as an
 *   in-memory buffer plus metadata. NOTHING is written to disk or to
 *   Supabase — the caller decides what to do with the bytes.
 *
 * Auth:
 *   The token is built from two env vars, NEVER logged:
 *     YEMOT_SYSTEM_NUMBER   — the system (login) number
 *     YEMOT_SYSTEM_PASSWORD — the management password
 *   Yemot accepts a direct "number:password" token, so no separate Login
 *   round-trip / session management is needed.
 *
 * Response shape from Yemot:
 *   On success → the raw file bytes (audio/wav etc.).
 *   On failure → a short JSON error body (e.g. session token required).
 *   We detect the JSON-error case and surface it instead of pretending a
 *   download succeeded.
 */

const DOWNLOAD_URL = 'https://www.call2all.co.il/ym/api/DownloadFile';
const GET_DIR_URL = 'https://www.call2all.co.il/ym/api/GetIVR2Dir';

/** Only Yemot file-system paths are allowed — never an external URL. */
export const YEMOT_PATH_PREFIX = 'ivr2:/';

export interface YemotDownloadOk {
  ok: true;
  contentType: string;
  sizeBytes: number;
}

export interface YemotDownloadErr {
  ok: false;
  error: string;
}

export type YemotDownloadResult = YemotDownloadOk | YemotDownloadErr;

/** Like YemotDownloadOk but also carries the bytes (kept in memory only). */
export interface YemotFetchOk {
  ok: true;
  contentType: string;
  sizeBytes: number;
  buffer: Buffer;
}

export type YemotFetchResult = YemotFetchOk | YemotDownloadErr;

/** True if the path is a well-formed Yemot file path (ivr2:/...). */
export function isValidYemotPath(path: string): boolean {
  if (!path.startsWith(YEMOT_PATH_PREFIX)) return false;
  // No protocol-like segments, no parent-dir traversal.
  if (path.includes('://')) return false;
  if (path.includes('..')) return false;
  return true;
}

/**
 * Recognises Yemot's "error body instead of a file" case. A real recording
 * is large binary; an error is small text starting with '{'.
 */
function looksLikeJsonError(contentType: string, buf: Buffer): boolean {
  return (
    contentType.includes('application/json') ||
    (buf.length > 0 && buf[0] === 0x7b /* '{' */ && buf.length < 4096)
  );
}

/** Extracts a human-readable message from a Yemot JSON error body. */
function jsonErrorMessage(buf: Buffer): string {
  const raw = buf.toString('utf8');
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return (
      (parsed.message as string) ??
      (parsed.responseStatus as string) ??
      raw.slice(0, 500)
    );
  } catch {
    return raw.slice(0, 500);
  }
}

/** Builds the "number:password" token; throws if env is missing. */
function buildToken(): string {
  const number = process.env.YEMOT_SYSTEM_NUMBER;
  const password = process.env.YEMOT_SYSTEM_PASSWORD;
  if (!number || !password) {
    throw new Error('YEMOT_SYSTEM_NUMBER / YEMOT_SYSTEM_PASSWORD not configured');
  }
  return `${number}:${password}`;
}

/**
 * Downloads a file from Yemot into memory and returns metadata only.
 * The actual bytes are read (to measure size) but not returned, so
 * callers can verify connectivity without handling file contents.
 */
export async function probeDownload(path: string): Promise<YemotDownloadResult> {
  let token: string;
  try {
    token = buildToken();
  } catch {
    return { ok: false, error: 'Yemot credentials not configured' };
  }

  const url = `${DOWNLOAD_URL}?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (e) {
    return { ok: false, error: `network error: ${(e as Error).message}` };
  }

  if (!res.ok) {
    return { ok: false, error: `Yemot returned HTTP ${res.status}` };
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = Buffer.from(await res.arrayBuffer());

  if (looksLikeJsonError(contentType, buf)) {
    return { ok: false, error: `Yemot error: ${jsonErrorMessage(buf)}` };
  }

  return { ok: true, contentType, sizeBytes: buf.length };
}

/**
 * Same as probeDownload but RETURNS the bytes so a caller can transcribe
 * them. The buffer lives only as long as the caller keeps it — nothing is
 * written to disk or storage here.
 */
export async function fetchFile(path: string): Promise<YemotFetchResult> {
  let token: string;
  try {
    token = buildToken();
  } catch {
    return { ok: false, error: 'Yemot credentials not configured' };
  }

  const url = `${DOWNLOAD_URL}?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (e) {
    return { ok: false, error: `network error: ${(e as Error).message}` };
  }

  if (!res.ok) {
    return { ok: false, error: `Yemot returned HTTP ${res.status}` };
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buffer = Buffer.from(await res.arrayBuffer());

  if (looksLikeJsonError(contentType, buffer)) {
    return { ok: false, error: `Yemot error: ${jsonErrorMessage(buffer)}` };
  }

  return { ok: true, contentType, sizeBytes: buffer.length, buffer };
}

/* ── Directory listing (GetIVR2Dir) ──────────────────────────────── */

export interface YemotListOk {
  ok: true;
  files: string[];
}
export type YemotListResult = YemotListOk | YemotDownloadErr;

/**
 * Collects candidate file names out of GetIVR2Dir's loosely-typed JSON.
 * The exact shape isn't firmly documented, so we accept several:
 *   files: ["000.wav", ...]                       (array of strings)
 *   files: [{ name: "000.wav" }, ...]             (name carries extension)
 *   files: [{ name: "000", extension: "wav" }]    (split name + extension)
 * The dry-run probe exists precisely to confirm which one Yemot returns.
 */
function extractFileNames(data: unknown): string[] {
  if (!data || typeof data !== 'object') return [];
  const arr = (data as Record<string, unknown>).files;
  if (!Array.isArray(arr)) return [];

  const names: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      if (item.length > 0) names.push(item);
      continue;
    }
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>;
      const name = (rec.name ?? rec.fileName ?? rec.file) as unknown;
      if (typeof name !== 'string' || name.length === 0) continue;
      const ext = rec.extension as unknown;
      if (
        typeof ext === 'string' &&
        ext.length > 0 &&
        !name.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ) {
        names.push(`${name}.${ext}`);
      } else {
        names.push(name);
      }
    }
  }
  return names;
}

/**
 * Lists the files in a Yemot directory via GetIVR2Dir. Returns just the
 * file names — no file is downloaded. Yemot's own error status (anything
 * other than responseStatus "OK") is surfaced as ok:false.
 */
export async function listDir(path: string): Promise<YemotListResult> {
  let token: string;
  try {
    token = buildToken();
  } catch {
    return { ok: false, error: 'Yemot credentials not configured' };
  }

  const url = `${GET_DIR_URL}?token=${encodeURIComponent(token)}&path=${encodeURIComponent(path)}`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET' });
  } catch (e) {
    return { ok: false, error: `network error: ${(e as Error).message}` };
  }
  if (!res.ok) {
    return { ok: false, error: `Yemot returned HTTP ${res.status}` };
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, error: 'GetIVR2Dir did not return JSON' };
  }

  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    if (typeof rec.responseStatus === 'string' && rec.responseStatus !== 'OK') {
      return { ok: false, error: `Yemot error: ${(rec.message as string) ?? rec.responseStatus}` };
    }
  }

  return { ok: true, files: extractFileNames(data) };
}

/**
 * A real caller recording is named with digits only: 001.wav, 002.wav…
 * Everything else in a Yemot folder is a system asset — menu prompts and
 * message files (M1012.wav, M1009.wav), ext.ini, etc. — and must never be
 * treated as the recording.
 */
const RECORDING_NAME = /^\d+\.wav$/i;

/** Numeric key of a recording file name ("001.wav" → 1). */
function wavSortKey(name: string): number {
  return parseInt(name, 10);
}

export interface YemotLatestOk {
  ok: true;
  path: string;
  fileName: string;
  files: string[];
}
export type YemotLatestResult = YemotLatestOk | YemotDownloadErr;

/**
 * Finds the newest .wav in a Yemot directory. "Newest" = highest number in
 * the file name, since Yemot names recordings 000.wav, 001.wav, … Returns
 * the full ivr2:/ path. Nothing is downloaded.
 */
export async function latestWav(dirPath: string): Promise<YemotLatestResult> {
  const listed = await listDir(dirPath);
  if (!listed.ok) return listed;

  // Keep only digit-named recordings; log every system file we skip.
  const recordings: string[] = [];
  for (const name of listed.files) {
    if (RECORDING_NAME.test(name)) {
      recordings.push(name);
    } else {
      console.log(`[yemot-process-latest] skip non-recording file ${name}`);
    }
  }

  if (recordings.length === 0) {
    const saw = listed.files.join(', ') || 'none';
    return {
      ok: false,
      error: `no_recording_wav_found in ${dirPath} (saw: ${saw})`,
    };
  }

  let best = recordings[0];
  for (const n of recordings) {
    if (wavSortKey(n) > wavSortKey(best)) best = n;
  }

  const base = dirPath.endsWith('/') ? dirPath.slice(0, -1) : dirPath;
  return { ok: true, path: `${base}/${best}`, fileName: best, files: recordings };
}
