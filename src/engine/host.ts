import type { ExamConfig } from '../types';
import { validateConfig } from './loadConfig';

/**
 * Host-page integration (popup / iframe embedding).
 *
 * Handshake:
 *   engine -> host   { type: "tcs-exam-engine:ready" }                 (repeats until answered)
 *   host   -> engine { type: "tcs-exam-engine:start", config }
 *   engine -> host   { type: "tcs-exam-engine:progress", result }      (partial snapshot, every 10s)
 *   engine -> host   { type: "tcs-exam-engine:result",   result }      (final)
 *
 * The exam config is accepted only from the window that opened / embeds the engine, and every
 * message back goes to the origin that sent the config, never to "*".
 */
export const MSG = {
  ready: 'tcs-exam-engine:ready',
  start: 'tcs-exam-engine:start',
  progress: 'tcs-exam-engine:progress',
  result: 'tcs-exam-engine:result',
} as const;

export const isEmbedded = () => new URLSearchParams(location.search).get('embed') === '1';

let host: { target: Window; origin: string } | null = null;
export const hasHost = () => host !== null;

/** Optional build-time allow-list, e.g. VITE_ALLOWED_HOST_ORIGINS="https://acedbe.vercel.app,http://localhost:3000". */
const allowed = ((import.meta.env.VITE_ALLOWED_HOST_ORIGINS as string | undefined) ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

function hostWindow(): Window | null {
  if (window.opener && window.opener !== window) return window.opener as Window;
  if (window.parent !== window) return window.parent;
  return null;
}

export function waitForHostConfig(timeoutMs = 30000): Promise<ExamConfig> {
  const target = hostWindow();
  if (!target) {
    return Promise.reject(new Error('Embed mode must be opened from a host page (popup or iframe).'));
  }
  return new Promise((resolve, reject) => {
    let iv = 0;
    let to = 0;
    const finish = () => {
      clearInterval(iv);
      clearTimeout(to);
      window.removeEventListener('message', onMessage);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== target) return;
      const d = e.data as { type?: string; config?: unknown } | null;
      if (!d || d.type !== MSG.start) return;
      if (allowed.length && !allowed.includes(e.origin)) {
        finish();
        reject(new Error(`${e.origin} is not allowed to start exams on this engine.`));
        return;
      }
      try {
        const cfg = validateConfig(d.config);
        host = { target, origin: e.origin };
        finish();
        resolve(cfg);
      } catch (err) {
        finish();
        reject(err);
      }
    };
    window.addEventListener('message', onMessage);
    const ping = () => {
      try {
        target.postMessage({ type: MSG.ready }, '*'); // carries no data
      } catch {
        /* host window gone */
      }
    };
    ping();
    iv = window.setInterval(ping, 400);
    to = window.setTimeout(() => {
      finish();
      reject(new Error('Timed out waiting for the host page to send the exam.'));
    }, timeoutMs);
  });
}

export function sendToHost(type: string, payload: Record<string, unknown>): boolean {
  if (!host) return false;
  try {
    host.target.postMessage({ type, ...payload }, host.origin);
    return true;
  } catch {
    return false;
  }
}

/** Marks the engine as running under a host without a handshake. Used by tests only. */
export function __resetHostForTests() {
  host = null;
}
