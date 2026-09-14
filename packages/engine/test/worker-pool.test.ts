import { describe, expect, it } from 'vitest';
import { WorkerPool, defaultPoolSize, type PoolSlot } from '../src/worker-pool.js';

interface FakeSlot extends PoolSlot {
  id: number;
  warmed: string[];
  terminated: boolean;
}

function makeFactory() {
  let n = 0;
  const slots: FakeSlot[] = [];
  return {
    slots,
    createSlot(): FakeSlot {
      n += 1;
      const slot: FakeSlot = {
        id: n,
        warmed: [],
        terminated: false,
        async warmup(kind) {
          slot.warmed.push(kind);
        },
        terminate() {
          slot.terminated = true;
        },
      };
      slots.push(slot);
      return slot;
    },
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('WorkerPool', () => {
  it('sizes between 2 and 4 by default', () => {
    expect(defaultPoolSize(1)).toBe(2);
    expect(defaultPoolSize(2)).toBe(2);
    expect(defaultPoolSize(3)).toBe(3);
    expect(defaultPoolSize(16)).toBe(4);
  });

  it('runs at most `size` jobs concurrently and preserves FIFO', async () => {
    const f = makeFactory();
    const pool = new WorkerPool({ createSlot: f.createSlot, size: 2 });
    let running = 0;
    let peak = 0;
    const order: number[] = [];
    const jobs = [1, 2, 3, 4, 5].map((i) =>
      pool.submit(`j${i}`, async () => {
        running += 1;
        peak = Math.max(peak, running);
        await sleep(5);
        running -= 1;
        order.push(i);
        return i;
      }),
    );
    expect(pool.pending).toBe(3);
    expect(pool.running).toBe(2);
    const results = await Promise.all(jobs.map((j) => j.promise));
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBe(2);
    expect(order.slice(0, 2).sort()).toEqual([1, 2]);
    expect(pool.snapshot().every((j) => j.status === 'done' && j.ratio === 1)).toBe(true);
    pool.dispose();
  });

  it('reports progress via subscribe', async () => {
    const f = makeFactory();
    const pool = new WorkerPool({ createSlot: f.createSlot, size: 1 });
    const seen: number[] = [];
    pool.subscribe((jobs) => {
      const j = jobs[0];
      if (j) seen.push(j.ratio);
    });
    await pool.submit('p', async (_slot, ctx) => {
      ctx.progress(0.5, 'half');
      ctx.progress(2);
    }).promise;
    expect(seen).toContain(0.5);
    expect(seen[seen.length - 1]).toBe(1);
    pool.dispose();
  });

  it('cancels queued jobs without touching workers and respawns on running cancel', async () => {
    const f = makeFactory();
    const pool = new WorkerPool({ createSlot: f.createSlot, size: 1 });
    const slow = pool.submit('slow', async (_s, ctx) => {
      await new Promise<void>((_, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('aborted'))));
    });
    const queued = pool.submit('queued', async () => 'never');
    pool.cancel(queued.id);
    await expect(queued.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.slots).toHaveLength(1);
    expect(f.slots[0]!.terminated).toBe(false);

    pool.cancel(slow.id);
    await expect(slow.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(f.slots[0]!.terminated).toBe(true);
    expect(f.slots).toHaveLength(2);
    expect(pool.size).toBe(1);

    // pool keeps working after respawn
    expect(await pool.submit('after', async (slot) => (slot as FakeSlot).id).promise).toBe(2);
    pool.dispose();
  });

  it('warms all idle slots once and re-warms respawned slots', async () => {
    const f = makeFactory();
    const pool = new WorkerPool({ createSlot: f.createSlot, size: 2 });
    await pool.warm('pdf');
    await pool.warm('pdf');
    expect(f.slots.map((s) => s.warmed)).toEqual([['pdf'], ['pdf']]);
    const j = pool.submit('x', async (_s, ctx) => {
      await new Promise<void>((_, reject) => ctx.signal.addEventListener('abort', () => reject(new Error('x'))));
    });
    pool.cancel(j.id);
    await j.promise.catch(() => undefined);
    await sleep(0);
    expect(f.slots[2]!.warmed).toEqual(['pdf']);
    pool.dispose();
  });

  it('limits heavy jobs to maxHeavy while light jobs continue', async () => {
    const f = makeFactory();
    const pool = new WorkerPool({ createSlot: f.createSlot, size: 4 });
    pool.maxHeavy = 1;
    let heavyRunning = 0;
    let heavyPeak = 0;
    const heavy = [1, 2].map(() =>
      pool.submit(
        'heavy',
        async () => {
          heavyRunning += 1;
          heavyPeak = Math.max(heavyPeak, heavyRunning);
          await sleep(10);
          heavyRunning -= 1;
        },
        { heavy: true },
      ),
    );
    const light = pool.submit('light', async () => 'l');
    expect(await light.promise).toBe('l');
    await Promise.all(heavy.map((h) => h.promise));
    expect(heavyPeak).toBe(1);
    pool.dispose();
  });

  it('marks failed jobs as error and keeps the slot alive', async () => {
    const f = makeFactory();
    const errors: unknown[] = [];
    const pool = new WorkerPool({ createSlot: f.createSlot, size: 1, onError: (e) => errors.push(e) });
    await expect(pool.submit('bad', async () => { throw new Error('nope'); }).promise).rejects.toThrow('nope');
    expect(errors).toHaveLength(1);
    expect(pool.snapshot()[0]!.status).toBe('error');
    expect(await pool.submit('good', async () => 1).promise).toBe(1);
    pool.prune();
    expect(pool.snapshot()).toEqual([]);
    pool.dispose();
  });
});
