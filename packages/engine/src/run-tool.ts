import { neoFileFromBytes } from './neo-file.js';
import type { NeoFile, ToolContext, ToolDefinition, ToolResult, VerificationReport } from './types.js';

/** Reload output bytes so verify never sees the same in-memory buffers `run` wrote. */
export async function reloadOutputs(outputs: readonly NeoFile[]): Promise<NeoFile[]> {
  const fresh: NeoFile[] = [];
  for (const file of outputs) {
    const bytes = await file.bytes();
    fresh.push(neoFileFromBytes(file.name, bytes.slice(), file.mime));
  }
  return fresh;
}

export function attachVerification(
  report: Record<string, unknown> | undefined,
  verification: VerificationReport,
): Record<string, unknown> {
  return {
    ...(report ?? {}),
    verification,
    sharedSafe: verification.passed,
  };
}

function missingVerifyReport(toolId: string): VerificationReport {
  return {
    passed: false,
    checks: [
      {
        id: 'verify-missing',
        passed: false,
        detail: `privacySensitive Tool ${toolId} hat keinen verify()-Hook — nicht shared-safe.`,
      },
    ],
  };
}

/**
 * Canonical runner: `run` then optional `verify` on freshly reloaded output bytes.
 */
export async function runTool(
  tool: ToolDefinition,
  ctx: ToolContext,
  files: NeoFile[],
  options: unknown,
): Promise<ToolResult> {
  const parsed = tool.options.parse(options ?? {});
  const result = await tool.run(ctx, files, parsed);

  let verification: VerificationReport | undefined;
  if (tool.verify) {
    ctx.progress(0.97, 'Verifikation');
    const fresh = await reloadOutputs(result.outputs);
    verification = await tool.verify(ctx, fresh, parsed);
  } else if (tool.privacySensitive) {
    verification = missingVerifyReport(tool.id);
  }

  if (verification) {
    result.report = attachVerification(result.report, verification);
  }
  return result;
}
