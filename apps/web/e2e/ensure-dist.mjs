#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(join(webRoot, 'dist/index.html'))) process.exit(0);

console.log('apps/web/dist missing — building @neotools/web…');
const result = spawnSync('pnpm', ['build'], { cwd: webRoot, stdio: 'inherit' });
process.exit(result.status ?? 1);
