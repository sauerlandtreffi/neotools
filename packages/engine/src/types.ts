import type { z } from 'zod';

export type Locale = 'de' | 'en';

export type Localized<T = string> = Record<Locale, T>;

export interface NeoFile {
  name: string;
  mime: string;
  size: number;
  bytes(): Promise<Uint8Array>;
  stream?(): ReadableStream<Uint8Array>;
}

export interface ToolResult {
  outputs: NeoFile[];
  report?: Record<string, unknown>;
  warnings: string[];
}

export type LogLevel = 'info' | 'warn' | 'error';

export type PlatformId = 'browser' | 'node';

export interface RenderPageRequest {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  data: Uint8ClampedArray;
  quality?: number;
}

export interface PlatformCapabilities {
  canvas: boolean;
  opfs: boolean;
  workers: boolean;
  qpdf: boolean;
  ocr: boolean;
  /** WebGPU available for ONNX / Transformers.js. */
  webgpu?: boolean;
  /** ONNX Runtime (web or node) may be used. */
  onnx?: boolean;
  /** System `ffmpeg` binary is on PATH (Node / CLI). */
  ffmpegNative?: boolean;
  /** WebCodecs VideoEncoder / VideoDecoder available. */
  webcodecs?: boolean;
  /** Folder picker (webkitdirectory / File System Access). */
  directoryPicker?: boolean;
}

export interface PlatformAssets {
  nerModel?: string;
  ocrLangPath?: string;
  /** Same-origin or filesystem base for ONNX/Transformers models (no CDN). */
  modelBase?: string;
  /** Same-origin or filesystem base for onnxruntime WASM files. */
  onnxWasmBase?: string;
  /** Same-origin or filesystem base for self-hosted ffmpeg.wasm cores. */
  ffmpegBase?: string;
}

export interface Platform {
  id: PlatformId;
  capabilities: PlatformCapabilities;
  encodeRaster?(req: RenderPageRequest): Promise<Uint8Array>;
  assets?: PlatformAssets;
}

export interface VerificationCheck {
  id: string;
  passed: boolean;
  detail?: string;
  /** When true, a failed check is a documented limit (UI warning), not a silent pass. */
  advisory?: boolean;
}

export interface VerificationReport {
  passed: boolean;
  checks: VerificationCheck[];
  /** Non-empty ⇒ UI must not present a silent green “shared-safe”. */
  warnings?: string[];
}

export interface ToolUi {
  editor?: string;
}

export interface ToolContext {
  progress(value: number, message?: string): void;
  signal: AbortSignal;
  log(level: LogLevel, message: string): void;
  platform: Platform;
}

export interface ToolInputs {
  accept: string[];
  multiple: boolean;
  min?: number;
  max?: number;
  /** Show folder picker when the platform exposes `directoryPicker`. */
  directory?: boolean;
}

export interface ToolOutputs {
  mime: string[];
}

export interface ToolPreset<O extends z.ZodTypeAny> {
  id: string;
  title: Localized;
  options: Partial<z.infer<O>>;
}

export interface ToolLicense {
  name: string;
  license: string;
  url: string;
}

export interface ToolSeo {
  keywords: string[];
  faq?: Array<{ q: Localized; a: Localized }>;
}

export interface ToolDefinition<O extends z.ZodTypeAny = z.ZodTypeAny> {
  id: string;
  pack: string;
  category: string;
  title: Localized;
  description: Localized;
  inputs: ToolInputs;
  outputs?: ToolOutputs;
  options: O;
  presets?: Array<ToolPreset<O>>;
  run(ctx: ToolContext, files: NeoFile[], options: z.infer<O>): Promise<ToolResult>;
  /**
   * Optional post-run check. The engine reloads output bytes before calling this
   * so verification never inspects an in-memory document from `run`.
   */
  verify?(
    ctx: ToolContext,
    outputs: readonly NeoFile[],
    options: z.infer<O>,
  ): Promise<VerificationReport>;
  /** When true, the runner always attaches a verification report (fails closed if `verify` is missing). */
  privacySensitive?: boolean;
  ui?: ToolUi;
  seo?: ToolSeo;
  licenses: ToolLicense[];
}

export type BatchStatus = 'ok' | 'error';

export interface BatchFileResult {
  file: string;
  status: BatchStatus;
  reason?: string;
}

export interface ProvenanceManifest {
  toolId: string;
  version: string;
  options: unknown;
  sourceSha256: string[];
  timestamp: string;
}

export interface PipelineStep {
  toolId: string;
  options: unknown;
  /** Light branch: only files whose MIME matches run this step; others pass through. */
  whenMime?: string[];
}

export interface PipelineSpec {
  steps: PipelineStep[];
}

export interface PipelineTypeError {
  stepIndex: number;
  toolId: string;
  message: string;
}

export const ENGINE_VERSION = '0.1.0';

export const MIME = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  txt: 'text/plain',
  json: 'application/json',
  md: 'text/markdown',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  zip: 'application/zip',
  xml: 'application/xml',
  csv: 'text/csv',
  ics: 'text/calendar',
  html: 'text/html',
  srt: 'application/x-subrip',
  vtt: 'text/vtt',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  epub: 'application/epub+zip',
  yaml: 'application/yaml',
  vcf: 'text/vcard',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
} as const;
