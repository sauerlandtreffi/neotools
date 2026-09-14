import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const conf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
if (conf.identifier !== 'app.neotools.desktop') throw new Error('identifier missing');
if (conf.app?.windows?.[0]?.title !== 'NeoTools') throw new Error('window title must be NeoTools');
if (!conf.bundle?.fileAssociations?.some((a) => a.ext?.includes('pdf'))) {
  throw new Error('pdf fileAssociations missing');
}
if (!conf.build?.frontendDist) throw new Error('frontendDist missing');
if (!conf.plugins?.updater?.pubkey) throw new Error('updater pubkey placeholder missing');
if (!Array.isArray(conf.plugins?.updater?.endpoints) || !conf.plugins.updater.endpoints.length) {
  throw new Error('updater endpoints missing');
}
if (conf.bundle?.createUpdaterArtifacts) throw new Error('updater artifacts must stay disabled until a real signing key exists');
if (!conf.plugins?.deepLink?.desktop?.schemes?.includes('neotools') && !conf.plugins?.['deep-link']?.desktop?.schemes?.includes('neotools')) {
  throw new Error('deep-link scheme neotools missing');
}
// --- capabilities: minimal, no blanket fs / shell / http ---------------------------------
const capDir = join(root, 'src-tauri/capabilities');
const capFiles = readdirSync(capDir).filter((f) => f.endsWith('.json'));
if (!capFiles.length) throw new Error('no capability files');
// Any permission from these plugins is forbidden — file I/O goes through the
// Rust commands (`read_file`/`save_file`) which enforce the path allowlist.
const FORBIDDEN_PLUGINS = ['fs', 'shell', 'http', 'process', 'os', 'sql', 'store', 'websocket', 'upload'];
for (const file of capFiles) {
  const cap = JSON.parse(readFileSync(join(capDir, file), 'utf8'));
  if (!Array.isArray(cap.windows) || cap.windows.some((w) => w !== 'main')) {
    throw new Error(`${file}: capabilities must be scoped to the "main" window only`);
  }
  if (cap.remote) throw new Error(`${file}: capabilities must not be exposed to remote URLs`);
  for (const perm of cap.permissions ?? []) {
    const id = typeof perm === 'string' ? perm : perm?.identifier;
    if (typeof id !== 'string') throw new Error(`${file}: malformed permission ${JSON.stringify(perm)}`);
    const plugin = id.split(':')[0];
    if (FORBIDDEN_PLUGINS.includes(plugin)) {
      // a scoped object form (e.g. shell with explicit `allow` scope) would be tolerated; strings never
      if (typeof perm === 'string' || !perm.allow) throw new Error(`${file}: forbidden permission ${id}`);
    }
    if (/allow-all$/.test(id)) throw new Error(`${file}: blanket permission ${id}`);
    if (/^core:(app|webview|window):allow-(create|eval|internal-toggle-devtools|set-devtools)/.test(id)) {
      throw new Error(`${file}: dangerous core permission ${id}`);
    }
  }
}

// --- Rust commands must keep the path allowlist ---------------------------------------------
const lib = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
for (const cmd of ['read_file', 'save_file']) {
  const at = lib.indexOf(`fn ${cmd}(`);
  if (at < 0) throw new Error(`lib.rs: ${cmd} missing`);
  const body = lib.slice(at, lib.indexOf('\n}\n', at));
  if (!body.includes('path_allowed(')) throw new Error(`lib.rs: ${cmd} must check path_allowed()`);
}
if (!lib.includes('pub fn valid_deep_link(')) throw new Error('lib.rs: valid_deep_link missing');

// --- CSP: wasm-unsafe-eval only, never generic unsafe-eval ---------------------------------
const csp = String(conf.app?.security?.csp ?? '');
if (!csp.includes("'wasm-unsafe-eval'")) throw new Error("CSP must contain 'wasm-unsafe-eval'");
if (/(^|[\s;])'unsafe-eval'/.test(csp)) throw new Error("generic 'unsafe-eval' is forbidden");
if (!/object-src 'none'/.test(csp)) throw new Error("CSP must set object-src 'none'");
if (!/connect-src 'self'(;|$)/.test(csp)) throw new Error("CSP connect-src must be 'self' only");
if (/https?:\/\//.test(csp)) throw new Error('CSP must not reference remote origins');
console.log('tauri.conf.json ok');
