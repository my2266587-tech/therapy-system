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

/** True if the path is a well-formed Yemot file path (ivr2:/...). */
export function isValidYemotPath(path: string): boolean {
  if (!path.startsWith(YEMOT_PATH_PREFIX)) return false;
  // No protocol-like segments, no parent-dir traversal.
  if (path.includes('://')) return false;
  if (path.includes('..')) return false;
  return true;
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

  // Yemot signals failure with a short JSON body instead of the file.
  // A real WAV is large and binary; an error body is small text starting
  // with '{'. Treat a JSON-looking body as an error and pass it through.
  const looksLikeJson =
    contentType.includes('application/json') ||
    (buf.length > 0 && buf[0] === 0x7b /* '{' */ && buf.length < 4096);
  if (looksLikeJson) {
    let message = buf.toString('utf8').slice(0, 500);
    try {
      const parsed = JSON.parse(buf.toString('utf8')) as Record<string, unknown>;
      message =
        (parsed.message as string) ??
        (parsed.responseStatus as string) ??
        message;
    } catch {
      /* keep raw text */
    }
    return { ok: false, error: `Yemot error: ${message}` };
  }

  return { ok: true, contentType, sizeBytes: buf.length };
}
