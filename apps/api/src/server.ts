#!/usr/bin/env node
import { createApiApp } from './app.js';
import { loadApiConfig } from './config.js';

const config = loadApiConfig();
const api = await createApiApp(config);
await api.app.listen({ host: config.host, port: config.port });
process.stderr.write(`NeoTools API http://${config.host}:${config.port}/api/v1/docs\n`);
