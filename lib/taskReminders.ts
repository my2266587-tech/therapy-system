/**
 * Sound + browser-notification helpers for the automatic calendar alerts
 * (components/tasks/TaskReminderWatcher.tsx).
 */

/* ── Sound ────────────────────────────────────────────────────────────────
 * Browsers only allow sound after the user has interacted with the page, so
 * the AudioContext is created (or resumed) on the first click/tap/key. */
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/** Call from a user gesture (click/tap) so later beeps are allowed. */
export function unlockAudio(): void {
  const ctx = getCtx();
  if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

/**
 * `count` short two-tone beeps, half a second apart — more beeps the closer
 * the item is (1 = in 15 min, 2 = in 5 min, 3 = now). Silent if the browser
 * blocks audio.
 */
export function playReminderBeep(count = 3): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  const start = ctx.currentTime + 0.05;
  for (let i = 0; i < count; i++) {
    for (const [offset, freq] of [[0, 880], [0.16, 1175]] as const) {
      const t = start + i * 0.5 + offset;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }
}

/** Ask once for permission to show system notifications (from a user gesture). */
export function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'default') void Notification.requestPermission().catch(() => {});
}
