import type { z } from 'zod';
import type { ToolDefinition } from './types.js';

export class Registry {
  private readonly tools = new Map<string, ToolDefinition<z.ZodTypeAny>>();

  register<O extends z.ZodTypeAny>(tool: ToolDefinition<O>): this {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool bereits registriert: ${tool.id}`);
    }
    this.tools.set(tool.id, tool as ToolDefinition<z.ZodTypeAny>);
    return this;
  }

  get(id: string): ToolDefinition<z.ZodTypeAny> | undefined {
    return this.tools.get(id);
  }

  require(id: string): ToolDefinition<z.ZodTypeAny> {
    const tool = this.tools.get(id);
    if (!tool) throw new Error(`Unbekanntes Tool: ${id}`);
    return tool;
  }

  list(): ToolDefinition<z.ZodTypeAny>[] {
    return [...this.tools.values()];
  }

  byPack(pack: string): ToolDefinition<z.ZodTypeAny>[] {
    return this.list().filter((t) => t.pack === pack);
  }

  byCategory(category: string): ToolDefinition<z.ZodTypeAny>[] {
    return this.list().filter((t) => t.category === category);
  }

  categories(): string[] {
    return [...new Set(this.list().map((t) => t.category))];
  }

  ids(): string[] {
    return [...this.tools.keys()];
  }

  get size(): number {
    return this.tools.size;
  }
}
