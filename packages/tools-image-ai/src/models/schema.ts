import { z } from 'zod';

export const modelInputSchema = z.object({
  layout: z.enum(['NCHW', 'NHWC']).default('NCHW'),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  color: z.enum(['RGB', 'BGR']).default('RGB'),
  normalize: z.enum(['imagenet', 'minus_one_one', 'zero_one', 'uint8']).default('zero_one'),
});

export const modelEntrySchema = z.object({
  id: z.string().min(1),
  tools: z.array(z.string().min(1)).min(1),
  kind: z.enum(['onnx', 'transformers']),
  backend: z.enum(['ort', 'transformers']),
  url: z.string().url(),
  sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  sizeBytes: z.number().int().positive(),
  license: z.string().min(1),
  origin: z.string().min(1),
  localName: z.string().min(1),
  input: modelInputSchema.optional(),
  files: z.array(z.string()).optional(),
  note: z.string().optional(),
});

export const modelRegistrySchema = z.object({
  version: z.literal(1),
  models: z.array(modelEntrySchema).min(1),
});

export type ModelInputSpec = z.infer<typeof modelInputSchema>;
export type ModelEntry = z.infer<typeof modelEntrySchema>;
export type ModelRegistry = z.infer<typeof modelRegistrySchema>;
