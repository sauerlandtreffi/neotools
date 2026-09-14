import { describe, expect, it } from 'vitest';
import { getDesktop, isTauriRuntime, webDesktopAdapter } from '../src/lib/desktop';

describe('desktop adapter', () => {
  it('reports no Tauri runtime in Node/web tests', () => {
    expect(isTauriRuntime()).toBe(false);
  });

  it('is a no-op outside Tauri', async () => {
    expect(webDesktopAdapter.available).toBe(false);
    expect(await webDesktopAdapter.readOpenedFile()).toBeNull();
    expect(await webDesktopAdapter.pickSavePath('x.pdf')).toBeNull();
    const stop = await webDesktopAdapter.listenOpenFile(() => {
      throw new Error('must not fire');
    });
    stop();
    await expect(webDesktopAdapter.readFile('/tmp/a.pdf')).rejects.toThrow(/not available/);
    await expect(webDesktopAdapter.saveFile('/tmp/a.pdf', new Uint8Array([1]))).rejects.toThrow(/not available/);
  });

  it('getDesktop resolves to the web no-op when __TAURI__ is absent', async () => {
    const adapter = await getDesktop();
    expect(adapter.available).toBe(false);
    expect(await adapter.readOpenedFile()).toBeNull();
  });
});
