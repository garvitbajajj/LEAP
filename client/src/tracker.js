/**
 * Batched interaction tracking (contract C1). Events queue in memory and in
 * localStorage, so they survive a reload, and flush every 10 seconds, at 20 events,
 * or when the page is hidden. Tracking never blocks or breaks the UI.
 */
import { api } from './api';

const KEY = 'leap.events';
const FLUSH_MS = 10_000;
const FLUSH_AT = 20;

const uuid = () => (globalThis.crypto?.randomUUID?.()
  ?? 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

const sessionId = uuid();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function save(q) {
  try { localStorage.setItem(KEY, JSON.stringify(q.slice(-500))); } catch { /* storage full or blocked */ }
}

let queue = load();
let flushing = false;

export async function flush({ keepalive = false } = {}) {
  if (flushing || queue.length === 0) return;
  flushing = true;
  const batch = queue.slice(0, 500);
  try {
    await api('/events', { method: 'POST', body: { events: batch }, keepalive });
    const sent = new Set(batch.map((e) => e.eventId));
    queue = queue.filter((e) => !sent.has(e.eventId));
    save(queue);
  } catch {
    // Keep the batch; the next timer tick or reconnect retries it. eventIds make replays safe.
  } finally {
    flushing = false;
  }
}

/** Records an event. `extra` may carry dwellSeconds, progressPct or score. */
export function track(type, itemId, extra = {}) {
  queue.push({ eventId: uuid(), itemId, type, sessionId, timestamp: new Date().toISOString(), ...extra });
  save(queue);
  if (queue.length >= FLUSH_AT) flush();
}

/** Records an event and flushes immediately - for completions the UI reacts to. */
export async function trackNow(type, itemId, extra = {}) {
  track(type, itemId, extra);
  await flush();
}

if (typeof window !== 'undefined') {
  setInterval(flush, FLUSH_MS);
  window.addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush({ keepalive: true });
  });
}

export const _test = { get queue() { return queue; }, reset() { queue = []; save(queue); } };
