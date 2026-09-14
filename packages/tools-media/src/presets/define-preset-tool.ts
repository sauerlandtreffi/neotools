import { z } from 'zod';
import {
  attachProvenance,
  createProvenance,
  defineTool,
  neoFileFromBytes,
  type NeoFile,
  type ToolDefinition,
  type ToolPreset,
  type ToolResult,
  type ToolSeo,
  type ToolUi,
} from '@neotools/engine';
import { MEDIA_LICENSES } from '../licenses.js';
import { largeFileWarnings } from '../ffmpeg/capabilities.js';
import { probe } from '../ffmpeg/probe.js';
import { runFfmpeg } from '../ffmpeg/run.js';
import type { ProbeResult } from '../ffmpeg/types.js';
import { inputAlias, mimeForExt, extOf } from '../names.js';

export interface PresetIo {
  inputs: string[];
  output: string;
}

export interface DefinePresetToolSpec<O extends z.ZodTypeAny> {
  id: string;
  category: 'video' | 'audio';
  title: { de: string; en: string };
  description: { de: string; en: string };
  inputs: { accept: string[]; multiple: boolean; min?: number; max?: number };
  outputs?: { mime: string[] };
  options: O;
  presets?: Array<ToolPreset<O>>;
  /** Filtergraph / Argumente aus Optionen + Probe. */
  ffmpeg: (opts: z.infer<O>, probes: ProbeResult[], io: PresetIo) => string[];
  outputName?: (opts: z.infer<O>, files: readonly NeoFile[], probes: ProbeResult[]) => string;
  extraFiles?: (opts: z.infer<O>, files: readonly NeoFile[]) => Promise<Record<string, Uint8Array>>;
  outputPrefix?: (opts: z.infer<O>) => string | undefined;
  report?: (opts: z.infer<O>, log: string, probes: ProbeResult[], files: Record<string, Uint8Array>) => Record<string, unknown>;
  mapOutputs?: (
    opts: z.infer<O>,
    files: Record<string, Uint8Array>,
    probes: ProbeResult[],
    inputs: readonly NeoFile[],
  ) => NeoFile[];
  ui?: ToolUi;
  seo?: ToolSeo;
}

export function definePresetTool<O extends z.ZodTypeAny>(spec: DefinePresetToolSpec<O>): ToolDefinition<O> {
  return defineTool({
    id: spec.id,
    pack: 'media',
    category: spec.category,
    title: spec.title,
    description: spec.description,
    inputs: spec.inputs,
    ...(spec.outputs ? { outputs: spec.outputs } : {}),
    options: spec.options,
    ...(spec.presets ? { presets: spec.presets } : {}),
    ...(spec.ui ? { ui: spec.ui } : {}),
    ...(spec.seo ? { seo: spec.seo } : {}),
    licenses: MEDIA_LICENSES,
    async run(ctx, files, options): Promise<ToolResult> {
      const opts = spec.options.parse(options ?? {});
      if (spec.inputs.min && files.length < spec.inputs.min) {
        throw new Error(`Mindestens ${spec.inputs.min} Datei(en) für ${spec.id}.`);
      }
      const warnings = largeFileWarnings(files, ctx);
      const probes: ProbeResult[] = [];
      for (let i = 0; i < files.length; i++) {
        ctx.progress(0.02 + (i / Math.max(files.length, 1)) * 0.1, `probe ${files[i]?.name}`);
        probes.push(await probe(files[i]!, ctx));
      }
      const defaultExt = spec.category === 'audio' ? 'wav' : 'mp4';
      const output = spec.outputName?.(opts, files, probes) ?? `out.${defaultExt}`;
      const aliases = files.map((f, i) => inputAlias(i, f.name));
      const args = spec.ffmpeg(opts, probes, { inputs: aliases, output });
      const extra = spec.extraFiles ? await spec.extraFiles(opts, files) : {};
      const result = await runFfmpeg(ctx, {
        args,
        inputs: await Promise.all(files.map(async (f, i) => ({ name: aliases[i]!, data: await f.bytes() }))),
        outputs: [output],
        outputPrefix: spec.outputPrefix?.(opts),
        durationHint: probes[0]?.duration,
        cwdExtra: extra,
      });
      let outputs: NeoFile[];
      if (spec.mapOutputs) {
        outputs = spec.mapOutputs(opts, result.files, probes, files);
      } else {
        const bytes = result.files[output];
        if (!bytes?.byteLength) {
          const extras = Object.entries(result.files).filter(([, b]) => b.byteLength);
          if (!extras.length) throw new Error(`${spec.id}: keine Ausgabe.\n${result.log.slice(-2000)}`);
          outputs = extras.map(([name, data]) => neoFileFromBytes(name, data, mimeForExt(extOf(name))));
        } else {
          outputs = [neoFileFromBytes(output, bytes, mimeForExt(extOf(output)))];
        }
      }
      const report = spec.report?.(opts, result.log, probes, result.files) ?? {};
      const provenance = await createProvenance(spec.id, opts, [...files]);
      return {
        outputs,
        warnings,
        report: attachProvenance({ ...report, backend: result.backend, ffmpeg: args }, provenance),
      };
    },
  });
}
