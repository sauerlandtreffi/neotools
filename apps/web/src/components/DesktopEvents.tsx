import { useEffect } from 'preact/hooks';

function pathFromDeepLink(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'neotools:') return null;
    const path = url.pathname && url.pathname !== '/' ? url.pathname : `/${url.hostname || ''}`;
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${normalized}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export default function DesktopEvents() {
  useEffect(() => {
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    if (!isTauri) return;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    void import('@tauri-apps/api/event').then(async ({ listen }) => {
      if (cancelled) return;
      unlisteners.push(
        await listen<string>('load-team-presets', async (ev) => {
          const { saveTeamPresetsJson } = await import('../lib/presets-store');
          await saveTeamPresetsJson(String(ev.payload));
          location.reload();
        }),
      );
      unlisteners.push(
        await listen<string>('navigate', (ev) => {
          const target = String(ev.payload);
          if (target.startsWith('/')) location.href = target;
        }),
      );
      unlisteners.push(
        await listen<string>('about', (ev) => {
          window.alert(String(ev.payload));
        }),
      );
      unlisteners.push(
        await listen<string>('open-deep-link', (ev) => {
          const next = pathFromDeepLink(String(ev.payload));
          if (next) location.href = next;
        }),
      );
    });
    return () => {
      cancelled = true;
      for (const off of unlisteners) off();
    };
  }, []);
  return null;
}
