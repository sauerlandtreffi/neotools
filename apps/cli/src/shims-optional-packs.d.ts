declare module '@neotools/tools-archive' {
  import type { Registry } from '@neotools/engine';
  export function registerArchiveTools(registry: Registry): Registry;
}
