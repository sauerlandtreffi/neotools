import type { z } from 'zod';
import type { ToolDefinition } from './types.js';

export function defineTool<O extends z.ZodTypeAny>(def: ToolDefinition<O>): ToolDefinition<O> {
  if (!def.id.trim()) throw new Error('Tool-ID darf nicht leer sein.');
  if (!def.pack.trim()) throw new Error(`Tool ${def.id}: pack fehlt.`);
  return def;
}
