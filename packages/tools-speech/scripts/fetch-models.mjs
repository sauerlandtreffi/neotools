#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../../models/scripts/fetch-models.mjs', import.meta.url));
const catalog = fileURLToPath(new URL('../src/models/models.json', import.meta.url));
const extra = process.argv.slice(2);
const args = extra.includes('--catalog') ? extra : ['--catalog', catalog, ...extra];
const child = spawn(process.execPath, [shared, ...args], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
