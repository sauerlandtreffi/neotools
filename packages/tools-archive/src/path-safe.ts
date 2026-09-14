const EXEC = /\.(exe|dll|bat|cmd|com|msi|scr|ps1|sh|bin|dylib|so)$/i;
const DOUBLE_EXT = /\.(pdf|jpg|png|txt|doc|docx)\.(exe|scr|js|vbs|bat)$/i;
const MAX_PATH = 255;
const MAX_GLOB = 200;

export function safeRelPath(name: string): string | undefined {
  const norm = name.normalize('NFC').replace(/\\/g, '/');
  if (!norm || norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) return undefined;
  if (norm.startsWith('\\\\') || norm.includes('\0')) return undefined;
  const parts = norm.split('/');
  if (parts.some((p) => p === '..' || p === '~')) return undefined;
  const joined = parts.filter((p) => p && p !== '.').join('/');
  if (!joined || joined.length > MAX_PATH) return undefined;
  return joined;
}

export function collisionKey(name: string): string {
  return name.normalize('NFC').toLowerCase();
}

export function isExecutableName(name: string): boolean {
  return EXEC.test(name);
}

export function hasDoubleExtension(name: string): boolean {
  return DOUBLE_EXT.test(name);
}

export function matchGlob(name: string, glob: string): boolean {
  if (glob.length > MAX_GLOB) return false;
  const n = name.replace(/\\/g, '/');
  const g = glob.replace(/\\/g, '/');
  if (g === '**' || g === '*') return true;
  if (/(\*\*){3,}/.test(g) || g.includes('(') && g.includes('+')) return false;
  const re = new RegExp(
    '^' +
      g
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '::DS::')
        .replace(/\*/g, '[^/]*')
        .replace(/::DS::/g, '.*') +
      '$',
  );
  return re.test(n) || re.test(n.split('/').pop() ?? n);
}
