import React from 'react';

function Svg({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export function PencilIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </Svg>
  );
}

export function TrashIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </Svg>
  );
}

export function EyeIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </Svg>
  );
}

export function PauseIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </Svg>
  );
}

export function PlayIcon({ size = 15 }: { size?: number }) {
  return (
    <Svg size={size}>
      <polygon points="6 4 20 12 6 20 6 4"/>
    </Svg>
  );
}

/* ── Shared icon button ── */
export function IconBtn({
  onClick, icon, hoverColor, title, stopPropagation = true,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  hoverColor: string;
  title: string;
  stopPropagation?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={e => { if (stopPropagation) e.stopPropagation(); onClick(); }}
      style={{
        width: 30, height: 30, borderRadius: 7,
        border: '1px solid #E8ECF0', backgroundColor: 'transparent',
        color: '#B0BEC5', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s', flexShrink: 0,
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.backgroundColor = hoverColor + '12';
        el.style.borderColor     = hoverColor + '45';
        el.style.color           = hoverColor;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.backgroundColor = 'transparent';
        el.style.borderColor     = '#E8ECF0';
        el.style.color           = '#B0BEC5';
      }}
    >
      {icon}
    </button>
  );
}
