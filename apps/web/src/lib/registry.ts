import { collectLicenses } from '@neotools/engine';
import { createPdfRegistry } from '@neotools/tools-pdf';
import { registerForensicsTools } from '@neotools/tools-forensics';

export const registry = registerForensicsTools(createPdfRegistry());

export const tools = registry.list();

export const licenses = collectLicenses(registry);

export function toolPaths() {
  return tools.map((tool) => ({ params: { toolId: tool.id } }));
}
