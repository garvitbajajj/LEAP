import { beforeEach, describe, expect, test, vi } from 'vitest';

const sent = [];
let failNext = false;
vi.mock('../api', () => ({
  api: vi.fn(async (path, { body }) => {
    if (failNext) { failNext = false; throw new Error('offline'); }
    sent.push(...body.events);
    return { accepted: body.events.length, rejected: [] };
  }),
}));

const { track, flush, _test } = await import('../tracker');

beforeEach(() => {
  sent.length = 0;
  failNext = false;
  _test.reset();
});

describe('event tracker', () => {
  test('queues events with a unique id, session and timestamp', () => {
    track('view', 'a'.repeat(24));
    track('view', 'a'.repeat(24));
    const [e1, e2] = _test.queue;
    expect(e1.eventId).not.toBe(e2.eventId);
    expect(e1.sessionId).toBe(e2.sessionId);
    expect(Date.parse(e1.timestamp)).not.toBeNaN();
  });

  test('flush sends the batch and empties the queue', async () => {
    track('view', 'a'.repeat(24));
    track('complete', 'b'.repeat(24), { progressPct: 100 });
    await flush();
    expect(sent.map((e) => e.type)).toEqual(['view', 'complete']);
    expect(_test.queue).toHaveLength(0);
  });

  test('a failed flush keeps events for the next attempt', async () => {
    track('view', 'a'.repeat(24));
    failNext = true;
    await flush();
    expect(_test.queue).toHaveLength(1);
    await flush();
    expect(sent).toHaveLength(1);
    expect(_test.queue).toHaveLength(0);
  });

  test('the queue survives a reload through localStorage', () => {
    track('like', 'c'.repeat(24));
    const stored = JSON.parse(localStorage.getItem('leap.events'));
    expect(stored.at(-1)).toMatchObject({ type: 'like', itemId: 'c'.repeat(24) });
  });

  test('reaching 20 events triggers an automatic flush', async () => {
    for (let i = 0; i < 20; i += 1) track('view', 'd'.repeat(24));
    await vi.waitFor(() => expect(sent).toHaveLength(20));
  });
});
