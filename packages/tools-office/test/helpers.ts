import { createToolContext } from '@neotools/engine';
import type { ToolContext } from '@neotools/engine';

export function ctx(): ToolContext {
  return createToolContext();
}
