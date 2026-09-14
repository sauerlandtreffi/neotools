import { afterEach, describe, expect, it } from 'vitest';
import {
  peekHandoff,
  putHandoff,
  putHandoffResult,
  resetHandoffMemory,
  takeHandoff,
  takeHandoffResult,
} from '../src/lib/desktop-handoff';

afterEach(() => {
  resetHandoffMemory();
});

describe('handoff store', () => {
  it('stores and retrieves a PDF payload in memory', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const meta = await putHandoff({ name: 'akte.pdf', mime: 'application/pdf', bytes }, { returnTo: 'reader', toolId: 'pdf-reorder' });
    expect(meta.name).toBe('akte.pdf');
    expect(meta.toolId).toBe('pdf-reorder');
    expect(await peekHandoff()).toMatchObject({ name: 'akte.pdf' });
    const got = await takeHandoff();
    expect(got?.name).toBe('akte.pdf');
    expect([...got!.bytes]).toEqual([37, 80, 68, 70]);
    expect(await takeHandoff()).toBeNull();
  });

  it('keeps the result slot separate from the outgoing handoff', async () => {
    await putHandoff({ name: 'in.pdf', mime: 'application/pdf', bytes: new Uint8Array([1]) });
    await putHandoffResult({ name: 'out.pdf', mime: 'application/pdf', bytes: new Uint8Array([2, 3]) });
    const incoming = await takeHandoff();
    const result = await takeHandoffResult();
    expect(incoming?.name).toBe('in.pdf');
    expect(result?.name).toBe('out.pdf');
    expect([...result!.bytes]).toEqual([2, 3]);
    expect(result?.returnTo).toBe('reader');
  });
});
