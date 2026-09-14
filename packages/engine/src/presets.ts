import { z } from 'zod';
import { Registry } from './registry.js';
import type { ToolDefinition } from './types.js';

/**
 * Team-Presets / Richtlinien (Wave 4).
 *
 * Agent P (Web/Docker) loads a `presets.json` (or `presets.signed.json`) and
 * calls `applyTeamPresets(registry, presets)` before serving tools.
 *
 * - `defaults[toolId]` are merged under caller options.
 * - `locked[toolId]` keys are forced back to the default after merge.
 * - `hiddenTools` are omitted from the returned registry.
 * - `requiredPipelines` is not executed here — Agent P must prepend those
 *   tool-ids (e.g. `pdf-sanitize` before send). Read via `getAppliedPresets`.
 * - `watermarkText` / `batesPrefix` are applied as defaults on any tool that
 *   exposes options with those names.
 */
export const teamPresetsSchema = z.object({
  version: z.number().int().min(1),
  organization: z.string().min(1),
  defaults: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
  locked: z.record(z.string(), z.array(z.string())).default({}),
  hiddenTools: z.array(z.string()).default([]),
  requiredPipelines: z.record(z.string(), z.array(z.string())).default({}),
  redactPatterns: z.array(z.unknown()).optional(),
  watermarkText: z.string().optional(),
  batesPrefix: z.string().optional(),
});

export type TeamPresets = z.infer<typeof teamPresetsSchema>;

const applied = new WeakMap<Registry, TeamPresets>();

export function getAppliedPresets(registry: Registry): TeamPresets | undefined {
  return applied.get(registry);
}

function globalDefaults(presets: TeamPresets, tool: ToolDefinition): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  const shape = (() => {
    try {
      const { inner } = unwrapObject(tool.options);
      return inner;
    } catch {
      return undefined;
    }
  })();
  if (shape && presets.watermarkText !== undefined && 'watermarkText' in shape) {
    extra.watermarkText = presets.watermarkText;
  }
  if (shape && presets.batesPrefix !== undefined && 'batesPrefix' in shape) {
    extra.batesPrefix = presets.batesPrefix;
  }
  return extra;
}

function unwrapObject(schema: z.ZodTypeAny): { inner: Record<string, unknown> } {
  let inner: z.ZodTypeAny = schema;
  for (;;) {
    if (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
      inner = inner.unwrap();
      continue;
    }
    if (inner instanceof z.ZodDefault) {
      inner = inner._def.innerType;
      continue;
    }
    if (inner instanceof z.ZodEffects) {
      inner = inner._def.schema;
      continue;
    }
    break;
  }
  if (inner instanceof z.ZodObject) return { inner: inner.shape as Record<string, unknown> };
  return { inner: {} };
}

export function mergePresetOptions(
  toolId: string,
  options: unknown,
  presets: TeamPresets,
  tool?: ToolDefinition,
): Record<string, unknown> {
  const incoming = options && typeof options === 'object' ? { ...(options as Record<string, unknown>) } : {};
  const g = tool ? globalDefaults(presets, tool) : {};
  const merged: Record<string, unknown> = {
    ...g,
    ...(presets.defaults[toolId] ?? {}),
    ...incoming,
  };
  const locked = presets.locked[toolId] ?? [];
  const forced = { ...g, ...(presets.defaults[toolId] ?? {}) };
  for (const key of locked) {
    if (key in forced) merged[key] = forced[key];
  }
  return merged;
}

export function applyTeamPresets(registry: Registry, presetsInput: unknown): Registry {
  const presets = teamPresetsSchema.parse(presetsInput);
  const hidden = new Set(presets.hiddenTools);
  const next = new Registry();
  for (const tool of registry.list()) {
    if (hidden.has(tool.id)) continue;
    const options = z.preprocess(
      (raw) => mergePresetOptions(tool.id, raw, presets, tool),
      tool.options,
    );
    next.register({
      ...tool,
      options,
    } as ToolDefinition);
  }
  applied.set(next, presets);
  return next;
}
