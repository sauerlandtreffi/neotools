/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface LaunchQueue {
  setConsumer(callback: (params: { files: FileSystemFileHandle[] }) => void): void;
}

interface Window {
  launchQueue?: LaunchQueue;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}
