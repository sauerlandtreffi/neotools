function unavailable(name: string): never {
  throw new Error(`node:child_process.${name} ist im Browser nicht verfügbar.`);
}
export function execFile(): never {
  return unavailable('execFile');
}
export function spawn(): never {
  return unavailable('spawn');
}
export function exec(): never {
  return unavailable('exec');
}
export function fork(): never {
  return unavailable('fork');
}
export function spawnSync(): never {
  return unavailable('spawnSync');
}
export function execSync(): never {
  return unavailable('execSync');
}
export function execFileSync(): never {
  return unavailable('execFileSync');
}
