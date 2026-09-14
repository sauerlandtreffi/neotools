import type { Registry } from '@neotools/engine';

const OPTIONAL: ReadonlyArray<readonly [string, string]> = [
  ['@neotools/tools-media', 'registerMediaTools'],
  ['@neotools/tools-speech', 'registerSpeechTools'],
  ['@neotools/tools-office', 'registerOfficeTools'],
  ['@neotools/tools-archive', 'registerArchiveTools'],
  ['@neotools/tools-creator', 'registerCreatorTools'],
];

export async function registerOptionalPacks(registry: Registry): Promise<Registry> {
  let current = registry;
  for (const [pkg, name] of OPTIONAL) {
    try {
      const mod = (await import(pkg)) as Record<string, unknown>;
      const fn = mod[name];
      if (typeof fn === 'function') current = (fn as (r: Registry) => Registry)(current);
    } catch {
      // Pack not installed or register* not exported yet.
    }
  }
  return current;
}
