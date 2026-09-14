import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const guides = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    locale: z.enum(['de', 'en']),
    tool: z.string().optional(),
    formats: z.array(z.string()).default([]),
    updated: z.string(),
    description: z.string(),
  }),
});

export const collections = { guides };
