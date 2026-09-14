import type { ComponentChildren, SVGAttributes } from 'preact';

type P = SVGAttributes<SVGSVGElement> & { size?: number };

function Svg({ size = 16, children, ...rest }: P & { children: ComponentChildren }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const I = {
  undo: (p: P) => (
    <Svg {...p}>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </Svg>
  ),
  redo: (p: P) => (
    <Svg {...p}>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </Svg>
  ),
  plus: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  x: (p: P) => (
    <Svg {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  ),
  check: (p: P) => (
    <Svg {...p}>
      <path d="m5 12 5 5L20 7" />
    </Svg>
  ),
  seal: (p: P) => (
    <Svg {...p}>
      <path d="M12 2 3 6v6c0 5 3.8 8.6 9 10 5.2-1.4 9-5 9-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </Svg>
  ),
  warn: (p: P) => (
    <Svg {...p}>
      <path d="M12 3 2 21h20z" />
      <path d="M12 9v5M12 17.5v.5" />
    </Svg>
  ),
  lock: (p: P) => (
    <Svg {...p}>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  ),
  export: (p: P) => (
    <Svg {...p}>
      <path d="M12 3v12M7 8l5-5 5 5" />
      <path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
    </Svg>
  ),
  search: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  ),
  file: (p: P) => (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
    </Svg>
  ),
  trash: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
    </Svg>
  ),
  rotate: (p: P) => (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v5h-5" />
    </Svg>
  ),
  zoomIn: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M11 8v6M8 11h6M20 20l-3.5-3.5" />
    </Svg>
  ),
  zoomOut: (p: P) => (
    <Svg {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="M8 11h6M20 20l-3.5-3.5" />
    </Svg>
  ),
  chevronL: (p: P) => (
    <Svg {...p}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  ),
  chevronR: (p: P) => (
    <Svg {...p}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  ),
  up: (p: P) => (
    <Svg {...p}>
      <path d="m6 15 6-6 6 6" />
    </Svg>
  ),
  down: (p: P) => (
    <Svg {...p}>
      <path d="m6 9 6 6 6-6" />
    </Svg>
  ),
  layers: (p: P) => (
    <Svg {...p}>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </Svg>
  ),
  command: (p: P) => (
    <Svg {...p}>
      <path d="M15 6a3 3 0 1 1 3 3h-3zM9 6a3 3 0 1 0-3 3h3zM15 18a3 3 0 1 0 3-3h-3zM9 18a3 3 0 1 1-3-3h3z" />
      <path d="M9 9h6v6H9z" />
    </Svg>
  ),
  diff: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </Svg>
  ),
  merge: (p: P) => (
    <Svg {...p}>
      <path d="M7 3v6a4 4 0 0 0 4 4h2a4 4 0 0 1 4 4v4M17 3v6" />
      <path d="m14 18 3 3 3-3" />
    </Svg>
  ),
  batch: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M17.5 14v7M14 17.5h7" />
    </Svg>
  ),
  keyboard: (p: P) => (
    <Svg {...p}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </Svg>
  ),
  spinner: (p: P) => (
    <Svg {...p} class={`nt-spin ${p.class ?? ''}`}>
      <path d="M12 3a9 9 0 1 0 9 9" />
    </Svg>
  ),
  eye: (p: P) => (
    <Svg {...p}>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  ),
  link: (p: P) => (
    <Svg {...p}>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </Svg>
  ),
  menu: (p: P) => (
    <Svg {...p}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  ),
  panelLeft: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
    </Svg>
  ),
  panelRight: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M15 4v16" />
    </Svg>
  ),
  sun: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  ),
  moon: (p: P) => (
    <Svg {...p}>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </Svg>
  ),
  folder: (p: P) => (
    <Svg {...p}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Svg>
  ),
  image: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </Svg>
  ),
  music: (p: P) => (
    <Svg {...p}>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </Svg>
  ),
  video: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </Svg>
  ),
  archive: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4" />
    </Svg>
  ),
  table: (p: P) => (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M9 4v16M15 4v16" />
    </Svg>
  ),
  fileText: (p: P) => (
    <Svg {...p}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </Svg>
  ),
  help: (p: P) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
    </Svg>
  ),
  home: (p: P) => (
    <Svg {...p}>
      <path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1Z" />
    </Svg>
  ),
  sliders: (p: P) => (
    <Svg {...p}>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </Svg>
  ),
  shield: (p: P) => (
    <Svg {...p}>
      <path d="M12 3 4 6v6c0 4.5 3.4 7.9 8 9 4.6-1.1 8-4.5 8-9V6Z" />
    </Svg>
  ),
  wand: (p: P) => (
    <Svg {...p}>
      <path d="m4 20 10-10M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1ZM19 12l.7 1.3L21 14l-1.3.7L19 16l-.7-1.3L17 14l1.3-.7Z" />
    </Svg>
  ),
  fingerprint: (p: P) => (
    <Svg {...p}>
      <path d="M6 9a6 6 0 0 1 12 0v3M9 9a3 3 0 0 1 6 0v6M12 9v10M4 13a8 8 0 0 0 1 4M20 13a8 8 0 0 1-1 4" />
    </Svg>
  ),
  arrowDown: (p: P) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </Svg>
  ),
  play: (p: P) => (
    <Svg {...p}>
      <path d="M7 5v14l11-7Z" />
    </Svg>
  ),
  pause: (p: P) => (
    <Svg {...p}>
      <path d="M8 5v14M16 5v14" />
    </Svg>
  ),
  check2: (p: P) => (
    <Svg {...p}>
      <path d="m5 12 4 4L19 6" />
    </Svg>
  ),
};
