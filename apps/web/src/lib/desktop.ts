export interface OpenedFile {
  name: string;
  path: string;
  bytes: Uint8Array;
}

export interface OpenedNotice {
  name: string;
  path: string;
}

export interface DesktopAdapter {
  available: boolean;
  readOpenedFile(): Promise<OpenedFile | null>;
  readFile(path: string): Promise<OpenedFile>;
  saveFile(path: string, bytes: Uint8Array): Promise<void>;
  pickSavePath(defaultName?: string): Promise<string | null>;
  listenOpenFile(handler: (notice: OpenedNotice) => void): Promise<() => void>;
}

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
type ListenFn = <T>(event: string, cb: (event: { payload: T }) => void) => Promise<() => void>;

function asBytes(raw: unknown): Uint8Array {
  if (raw instanceof Uint8Array) return raw;
  if (raw instanceof ArrayBuffer) return new Uint8Array(raw);
  if (Array.isArray(raw)) return Uint8Array.from(raw as number[]);
  return new Uint8Array();
}

function toOpened(raw: { name: string; path: string; bytes: unknown }): OpenedFile {
  return { name: raw.name, path: raw.path, bytes: asBytes(raw.bytes) };
}

export const webDesktopAdapter: DesktopAdapter = {
  available: false,
  async readOpenedFile() {
    return null;
  },
  async readFile() {
    throw new Error('Desktop is not available');
  },
  async saveFile() {
    throw new Error('Desktop is not available');
  },
  async pickSavePath() {
    return null;
  },
  async listenOpenFile() {
    return () => undefined;
  },
};

export function isTauriRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return w.__TAURI__ !== undefined || w.__TAURI_INTERNALS__ !== undefined;
}

async function loadTauriApi(): Promise<{ invoke: InvokeFn; listen: ListenFn } | null> {
  try {
    const core = await import('@tauri-apps/api/core');
    const event = await import('@tauri-apps/api/event');
    return { invoke: core.invoke as InvokeFn, listen: event.listen as ListenFn };
  } catch {
    return null;
  }
}

function createTauriAdapter(invoke: InvokeFn, listen: ListenFn): DesktopAdapter {
  return {
    available: true,
    async readOpenedFile() {
      try {
        const raw = await invoke<{ name: string; path: string; bytes: unknown }>('read_opened_file');
        return toOpened(raw);
      } catch {
        return null;
      }
    },
    async readFile(path: string) {
      const raw = await invoke<{ name: string; path: string; bytes: unknown }>('read_file', { path });
      return toOpened(raw);
    },
    async saveFile(path: string, bytes: Uint8Array) {
      await invoke('save_file', { path, bytes: Array.from(bytes) });
    },
    async pickSavePath(defaultName?: string) {
      return invoke<string | null>('pick_save_path', { defaultName: defaultName ?? null });
    },
    async listenOpenFile(handler) {
      return listen<OpenedNotice>('open-file', (ev) => {
        handler(ev.payload);
      });
    },
  };
}

export async function getDesktop(): Promise<DesktopAdapter> {
  if (!isTauriRuntime()) return webDesktopAdapter;
  const api = await loadTauriApi();
  if (!api) return webDesktopAdapter;
  return createTauriAdapter(api.invoke, api.listen);
}
