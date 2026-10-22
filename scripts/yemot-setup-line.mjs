/**
 * Sets up a Yemot Mashiach line for the guided 3-part phone summary.
 *
 *   The whole call flow lives in the ROOT extension (type=api):
 *     prompt 000 → record into /2/1   (שם המטופלת + מצב נוכחי)
 *     prompt 001 → record into /2/2   (נושאים + מה עשינו בטיפול)
 *     prompt 002 → record into /2/3   (משימות, התקדמות, קושי, הבא, הערות)
 *     → GET api_link = /api/phone/yemot-process-latest, which picks the
 *       highest-numbered .wav in each folder and answers with
 *       `id_list_message=t-...` that Yemot reads to the caller.
 *   Recordings are auto-numbered (000.wav, 001.wav…), which is exactly what
 *   latestWav() in lib/yemot.ts expects.
 *
 * Usage (values are never printed):
 *   YEMOT_TOKEN=<api key | number:password> \
 *   YEMOT_WEBHOOK_SECRET=<same value as in Vercel> \
 *   node scripts/yemot-setup-line.mjs [--dry-run] [--backup-dir <dir>]
 *
 *   --dry-run     print the files that would be written, touch nothing
 *   --backup-dir  where to save the current root ext.ini before overwriting
 *                 (default: current directory)
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://www.call2all.co.il/ym/api';
const SITE = 'https://crm-sde-hemed.vercel.app';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const backupIdx = args.indexOf('--backup-dir');
const backupDir = backupIdx >= 0 ? args[backupIdx + 1] : '.';

const token = process.env.YEMOT_TOKEN;
const secret = process.env.YEMOT_WEBHOOK_SECRET;
if (!secret) fail('YEMOT_WEBHOOK_SECRET is required');
if (!token && !dryRun) fail('YEMOT_TOKEN is required');

const apiLink =
  `${SITE}/api/phone/yemot-process-latest` +
  `?secret=${encodeURIComponent(secret)}&response_mode=yemot`;

/** Path → contents. Order matters only for readability of the log. */
const FILES = {
  'ivr2:/ext.ini': [
    'type=api',
    `api_link=${apiLink}`,
    'api_000=R1,,record,/2/1,,,no',
    'api_001=R2,,record,/2/2,,,no',
    'api_002=R3,,record,/2/3,,,no',
    'api_hangup_send=no',
    'say_api_answer=yes',
    '',
  ].join('\n'),
  'ivr2:/000.tts':
    'שלום, כאן מערכת סיכומי הטיפול. לאחר הצליל אמרי את שם המטופלת ואת המצב הנוכחי שלה. בסיום הקישי סולמית.',
  'ivr2:/001.tts':
    'כעת, לאחר הצליל, ספרי על הנושאים החשובים שעלו בפגישה ועל מה שעשיתם בטיפול. בסיום הקישי סולמית.',
  'ivr2:/002.tts':
    'ולסיום, לאחר הצליל, ספרי על המשימות שהמטופלת קיבלה, ההתקדמות, הקושי בהתקדמות, עם מה מתחילים בפגישה הבאה, והערות נוספות. בסיום הקישי סולמית.',
};

function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

/** Never let the secret or token reach the console. */
function redact(text) {
  let out = text.split(secret).join('<SECRET>');
  if (token) out = out.split(token).join('<TOKEN>');
  return out;
}

async function call(command, params) {
  const body = new URLSearchParams({ token, ...params });
  const res = await fetch(`${API}/${command}`, { method: 'POST', body });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* raw file body */ }
  return { status: res.status, text, json };
}

function assertOk(command, r) {
  if (r.json && r.json.responseStatus && r.json.responseStatus !== 'OK') {
    fail(`${command}: ${r.json.responseStatus} — ${r.json.message ?? ''}`);
  }
  if (r.status >= 400) fail(`${command}: HTTP ${r.status}`);
}

async function main() {
  if (dryRun) {
    for (const [path, contents] of Object.entries(FILES)) {
      console.log(`--- ${path}\n${redact(contents)}\n`);
    }
    console.log('dry run: nothing written');
    return;
  }

  // 1. Login check — fails fast on a wrong key / MFA_REQUIRED.
  const session = await call('GetSession', {});
  assertOk('GetSession', session);
  console.log('login OK');

  // 2. Back up the current root ext.ini (may not exist on a new system).
  const old = await call('DownloadFile', { path: 'ivr2:/ext.ini' });
  if (!old.json) {
    const file = join(backupDir, `yemot-root-ext-backup-${Date.now()}.ini`);
    writeFileSync(file, old.text, 'utf8');
    console.log(`backed up current root ext.ini → ${file}`);
  } else {
    console.log('no existing root ext.ini to back up');
  }

  // 3. Write every file, then read it back and compare.
  for (const [path, contents] of Object.entries(FILES)) {
    const up = await call('UploadTextFile', { what: path, contents });
    assertOk(`UploadTextFile ${path}`, up);
    const back = await call('DownloadFile', { path });
    if (back.json) fail(`read-back ${path}: ${back.json.message ?? back.text}`);
    if (back.text.trim() !== contents.trim()) {
      fail(`read-back ${path}: contents differ from what was written`);
    }
    console.log(`wrote + verified ${path}`);
  }

  console.log('done — the line is configured. Dial it to test.');
}

main().catch((e) => fail(redact(e.message)));
