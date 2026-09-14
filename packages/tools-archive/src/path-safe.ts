const EXEC = /\.(exe|dll|bat|cmd|com|msi|scr|ps1|sh|bin|dylib|so)$/i;
const DOUBLE_EXT = /\.(pdf|jpg|png|txt|doc|docx)\.(exe|scr|js|vbs|bat)$/i;

export function safeRelPath(name: string): string | undefined {
  const norm = name.replace(/\\/g, '/');
  if (!norm || norm.startsWith('/') || /^[A-Za-z]:/.test(norm)) return undefined;
  const parts = norm.split('/');
  if (parts.some((p) => p === '..')) return undefined;
  return parts.filter((p) => p && p !== '.').join('/');
}

export function isExecutableName(name: string): boolean {
  return EXEC.test(name);
}

export function hasDoubleExtension(name: string): boolean {
  return DOUBLE_EXT.test(name);
}

export function matchGlob(name: string, glob: string): boolean {
  const n = name.replace(/\\/g, '/');
  const g = glob.replace(/\\/g, '/');
  if (g === '**' || g === '*') return true;
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
