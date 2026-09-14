import { readFileSync } from 'node:fs';
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
if (conf.bundle?.createUpdaterArtifacts) throw new Error('updater artifacts must stay disabled');
if (!conf.plugins?.deepLink?.desktop?.schemes?.includes('neotools') && !conf.plugins?.['deep-link']?.desktop?.schemes?.includes('neotools')) {
  throw new Error('deep-link scheme neotools missing');
}
console.log('tauri.conf.json ok');
