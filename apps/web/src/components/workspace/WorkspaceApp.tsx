import { useEffect, useState } from 'preact/hooks';
import type { Locale } from '../../lib/i18n';
import { w } from '../../lib/workspace/i18n';
import { parseWorkspaceQuery } from '../../lib/workspace/router';
import {
  activeFile,
  activateFile,
  addBrowserFiles,
  addIncoming,
  applyPending,
  closeOverlays,
  familyOf,
  initWorkspace,
  redo,
  setPage,
  setPendingTool,
  setRedactMode,
  setSelection,
  setUi,
  setZoom,
  tools,
  undo,
  workspace,
  type Sheet,
  type WorkspaceToolMeta,
} from '../../lib/workspace/store';
import ActionBar from './ActionBar';
import BatchOverlay from './BatchOverlay';
import DiffView from './DiffView';
import EmptyState from './EmptyState';
import ExportDrawer from './ExportDrawer';
import FileTray from './FileTray';
import FindingBar from './FindingBar';
import GenericCanvas from './GenericCanvas';
import { I } from './Icons';
import JobDock from './JobDock';
import MergeOverlay from './MergeOverlay';
import OptionsPanel from './OptionsPanel';
import Palette from './Palette';
import PdfCanvas from './PdfCanvas';
import ShortcutsHelp from './ShortcutsHelp';
import StepStack from './StepStack';
import ThumbRail from './ThumbRail';
import Toasts from './Toasts';
import TopBar from './TopBar';

interface Props {
  locale: Locale;
  toolsJson: string;
  brandName: string;
  logo: string;
  policyLabel?: string | null;
}

interface LaunchQueueLike {
  setConsumer(cb: (params: { files: Array<{ getFile(): Promise<File> }> }) => void): void;
}

export default function WorkspaceApp({ locale, toolsJson, brandName, logo, policyLabel }: Props) {
  const s = workspace.value;
  const file = activeFile.value;
  const [trayOpen, setTrayOpen] = useState(false);

  // boot: parse query, load session, handle desktop/PWA/handoff sources
  useEffect(() => {
    const q = parseWorkspaceQuery(location.search, location.hash);
    const parsed = JSON.parse(toolsJson) as WorkspaceToolMeta[];
    const isTauri = '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
    let disposed = false;
    const unlisten: Array<() => void> = [];
    (async () => {
      await initWorkspace({ locale, tools: parsed, sessionId: q.session, desktop: isTauri, policyLabel: policyLabel ?? null });
      if (disposed) return;
      if (q.tool && parsed.some((t) => t.view.id === q.tool)) setPendingTool(q.tool, q.options, q.preset);
      if (q.file && workspace.value.session?.files.some((f) => f.id === q.file)) await activateFile(q.file);
      if (q.selection.pages?.length) setSelection({ pages: q.selection.pages });
      if (q.selection.pages?.[0]) setPage(q.selection.pages[0]);

      // Tauri: file opened via double-click / open-file event
      if (isTauri) {
        const { getDesktop } = await import('../../lib/desktop');
        const desktop = await getDesktop();
        if (q.desktop) {
          const opened = await desktop.readOpenedFile();
          if (opened) await addIncoming([{ name: opened.name, mime: '', bytes: opened.bytes }]);
        }
        unlisten.push(
          await desktop.listenOpenFile(async (notice) => {
            try {
              const f = await desktop.readFile(notice.path);
              await addIncoming([{ name: f.name, mime: '', bytes: f.bytes }]);
            } catch {
              // ignore
            }
          }),
        );
      }
      // PWA file handler / share target handoff slot
      if (q.handoff) {
        const { takeHandoff } = await import('../../lib/desktop-handoff');
        const h = await takeHandoff();
        if (h) {
          await addIncoming([{ name: h.name, mime: h.mime, bytes: h.bytes }]);
          if (h.toolId) setPendingTool(h.toolId);
        }
      }
      const lq = (window as unknown as { launchQueue?: LaunchQueueLike }).launchQueue;
      if (lq) {
        lq.setConsumer(async (params) => {
          const files = await Promise.all(params.files.map((h) => h.getFile()));
          await addBrowserFiles(files);
        });
      }
    })().catch(() => undefined);
    return () => {
      disposed = true;
      for (const off of unlisten) off();
    };
  }, []);

  // global drop + paste + shortcuts
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      void addBrowserFiles(Array.from(e.dataTransfer.files));
    };
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      void addBrowserFiles(files);
    };
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      const mod = e.metaKey || e.ctrlKey;
      const st = workspace.value;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setUi({ paletteOpen: !st.paletteOpen });
        return;
      }
      if (e.key === 'Escape') {
        if (st.paletteOpen || st.exportOpen || st.mergeOpen || st.batchOpen || st.shortcutsOpen || st.diffStepId || st.sheet) {
          closeOverlays();
        } else if (st.selection.pages?.length) {
          setSelection({});
        } else if (st.pendingToolId) {
          setPendingTool(null);
        }
        return;
      }
      if (typing) {
        if (mod && e.key === 'Enter') {
          e.preventDefault();
          void applyPending();
        }
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void (e.shiftKey ? redo() : undo());
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        void redo();
        return;
      }
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        void applyPending();
        return;
      }
      if (mod && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (activeFile.value) setUi({ exportOpen: true });
        return;
      }
      if (mod && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        (document.querySelector('[data-tray-input],[data-empty-input]') as HTMLInputElement | null)?.click();
        return;
      }
      if (mod) return;
      if (e.key === '?') {
        e.preventDefault();
        setUi({ shortcutsOpen: true });
      } else if (e.key === '/') {
        e.preventDefault();
        (document.querySelector('[data-search-open]') as HTMLButtonElement | null)?.click();
      } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        setPage(st.page + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        setPage(st.page - 1);
      } else if (e.key === '+' || e.key === '=') {
        setZoom(st.zoom + 0.15);
      } else if (e.key === '-') {
        setZoom(st.zoom - 0.15);
      } else if (st.pendingToolId === 'pdf-redact' && (e.key === 't' || e.key === 'T')) {
        setRedactMode('text');
      } else if (st.pendingToolId === 'pdf-redact' && (e.key === 'r' || e.key === 'R')) {
        setRedactMode('rect');
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!s.ready) {
    return (
      <div class="ws-root" data-workspace data-ready="false">
        <p class="m-auto text-sm" style={{ color: 'var(--muted)' }}>
          {w(locale, 'loading')}
        </p>
      </div>
    );
  }

  const hasFiles = Boolean(s.session?.files.length);
  const family = familyOf(file);
  const hasPending = Boolean(s.pendingToolId && tools.value.some((t) => t.view.id === s.pendingToolId));
  const sheet: Sheet = s.sheet;

  return (
    <div class="ws-root" data-workspace data-ready="true" data-family={family ?? 'none'} data-has-files={hasFiles}>
      <a href="#ws-doc" class="skip-link">
        {w(locale, 'skip')}
      </a>
      <TopBar locale={locale} brandName={brandName} logo={logo} onToggleTray={() => setTrayOpen((v) => !v)} />
      {!hasFiles ? (
        <main class="ws-main ws-main-empty" id="ws-doc">
          <EmptyState locale={locale} />
        </main>
      ) : (
        <div class="ws-body" data-tray-open={trayOpen}>
          <div class="ws-tray-col" data-open={trayOpen} onClick={(e) => e.target === e.currentTarget && setTrayOpen(false)}>
            <FileTray locale={locale} onClose={() => setTrayOpen(false)} />
          </div>
          <main class="ws-main" id="ws-doc" tabIndex={-1}>
            <ActionBar locale={locale} />
            <FindingBar locale={locale} />
            <div class="ws-doc-row">
              {family === 'pdf' && <ThumbRail locale={locale} />}
              {family === 'pdf' ? <PdfCanvas locale={locale} /> : <GenericCanvas locale={locale} />}
            </div>
          </main>
          <aside class="ws-side" data-sheet={sheet}>
            {hasPending ? <OptionsPanel locale={locale} onClose={() => setUi({ sheet: null })} /> : null}
            <StepStack locale={locale} onClose={() => setUi({ sheet: null })} />
          </aside>
        </div>
      )}
      {hasFiles && (
        <nav class="ws-tabbar ws-only-mobile" aria-label="Workspace">
          <button type="button" class="ws-tab" data-on={trayOpen} onClick={() => setTrayOpen((v) => !v)}>
            <I.file size={18} />
            <span>{w(locale, 'tray')}</span>
          </button>
          <button type="button" class="ws-tab" data-on={sheet === 'options'} onClick={() => setUi({ sheet: sheet === 'options' ? null : 'options' })}>
            <I.layers size={18} />
            <span>{w(locale, 'options')}</span>
          </button>
          <button type="button" class="ws-tab" data-on={sheet === 'stack'} onClick={() => setUi({ sheet: sheet === 'stack' ? null : 'stack' })}>
            <I.undo size={18} />
            <span>{w(locale, 'stack')}</span>
          </button>
          <button type="button" class="ws-tab" onClick={() => setUi({ exportOpen: true })}>
            <I.export size={18} />
            <span>{w(locale, 'export')}</span>
          </button>
        </nav>
      )}
      <JobDock locale={locale} />
      <Toasts />
      <ExportDrawer locale={locale} />
      <MergeOverlay locale={locale} />
      <BatchOverlay locale={locale} />
      <Palette locale={locale} />
      <ShortcutsHelp locale={locale} />
      {s.diffStepId && <DiffView locale={locale} />}
    </div>
  );
}
