import { familyForMime, type WorkspaceFamily } from '@neotools/engine';

/**
 * Content-based type detection for the workspace (pivot §11.1/3): the workspace
 * that loads is chosen by magic bytes, not by the extension the OS claims.
 * The signature catalogue lives in tools-forensics and is loaded lazily on the
 * first drop so the shell bundle stays small.
 */
export interface SniffResult {
  /** Best MIME for routing (content first, claimed/extension as fallback). */
  mime: string;
  /** Content MIME when the signature catalogue recognised the bytes. */
  detected?: string;
  /** Extension/OS claim disagrees with the content. */
  mismatch: boolean;
  confidence: number;
}

const GENERIC = new Set(['', 'application/octet-stream', 'application/x-unknown', 'binary/octet-stream']);

type Identify = (bytes: Uint8Array, name: string, claimed?: string) => {
  primary?: { mime: string; confidence: number };
  mimeMatch: boolean;
  extensionMatch: boolean;
};

let identifyPromise: Promise<Identify> | null = null;
function loadIdentify(): Promise<Identify> {
  identifyPromise ??= import('../../../../../packages/tools-forensics/src/identify/identify').then((m) => m.identifyBytes as Identify);
  return identifyPromise;
}

export async function sniffMime(bytes: Uint8Array, name: string, claimed: string): Promise<SniffResult> {
  const claim = (claimed || '').split(';')[0]!.trim().toLowerCase();
  try {
    const identify = await loadIdentify();
    const id = identify(bytes.subarray(0, Math.min(bytes.length, 2 * 1024 * 1024)), name, claim || 'application/octet-stream');
    const detected = id.primary?.mime;
    const confidence = id.primary?.confidence ?? 0;
    if (detected && detected !== 'application/octet-stream' && confidence >= 0.6) {
      // A confident content match wins whenever the claim is generic, or when it
      // points to a *different* family (e.g. "foto.jpg" that is really a PDF).
      const generic = GENERIC.has(claim);
      const differentFamily = !generic && familyForMime(claim) !== familyForMime(detected);
      const textualClaim = claim.startsWith('text/') && detected.startsWith('text/');
      if (generic || (differentFamily && !textualClaim) || claim === detected) {
        return { mime: detected, detected, mismatch: !generic && claim !== detected, confidence };
      }
      return { mime: claim, detected, mismatch: !id.mimeMatch, confidence };
    }
    return { mime: claim, detected, mismatch: false, confidence };
  } catch {
    return { mime: claim, mismatch: false, confidence: 0 };
  }
}

/** UI sub-family: the engine keeps audio+video as `media`, the shell shows separate workspaces. */
export type WorkspaceKind = WorkspaceFamily | 'audio' | 'video' | 'unknown';

export function workspaceKind(mime: string, family: WorkspaceFamily | null): WorkspaceKind {
  if (family === 'media') return mime.startsWith('video/') ? 'video' : 'audio';
  return family ?? 'unknown';
}
