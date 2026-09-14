import type { Locale } from '../i18n';
import { buildWorkspaceQuery, workspacePath } from './router';
import { getSessionStore } from './session-store';

export interface HandoffInput {
  name: string;
  mime: string;
  data: Uint8Array;
}

/**
 * Landing → workspace handoff (FRONTEND-REDESIGN W1): the dropped files are
 * written into a fresh session (OPFS/IDB) and `/app` opens with
 * `?session=…&tool=…&file=…` — no re-upload, no transfer through the URL.
 */
export async function handoffToWorkspace(
  locale: Locale,
  toolId: string | undefined,
  files: HandoffInput[],
  options?: Record<string, unknown>,
): Promise<string> {
  const store = getSessionStore();
  let session = await store.create();
  let firstId: string | undefined;
  for (const f of files) {
    const res = await store.addFile(session, { name: f.name, mime: f.mime, bytes: f.data });
    session = res.meta;
    firstId ??= res.file.id;
  }
  const url = `${workspacePath(locale)}${buildWorkspaceQuery({ session: session.id, tool: toolId, file: firstId, options })}`;
  return url;
}

/** Families the W2 workspace can show natively. */
export function workspaceSupports(mime: string): boolean {
  return mime === 'application/pdf' || mime.startsWith('image/');
}
