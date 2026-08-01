// 简洁线性图标 —— 内联 SVG，避免引入图标库依赖。18x18，currentColor 描边。

const COMMON = { width: 16, height: 16, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };

const PATHS = {
  plus: <path d="M9 3v12M3 9h12" />,
  argument: <path d="M3 4h12v8H7l-3 3v-3H3z" />,
  meeting: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="12" cy="6" r="2" />
      <path d="M2.5 14c.4-2 1.8-3 3.5-3s3.1 1 3.5 3M8.5 14c.4-2 1.8-3 3.5-3s3.1 1 3.5 3" />
    </>
  ),
  radar: (
    <>
      <circle cx="9" cy="9" r="6" />
      <circle cx="9" cy="9" r="2.5" />
      <path d="M9 3v1.5M9 13.5V15M3 9h1.5M13.5 9H15" />
    </>
  ),
  decision: (
    <>
      <rect x="3" y="3" width="5" height="5" rx="1" />
      <rect x="10" y="3" width="5" height="5" rx="1" />
      <rect x="3" y="10" width="5" height="5" rx="1" />
      <rect x="10" y="10" width="5" height="5" rx="1" />
    </>
  ),
  overview: (
    <>
      <path d="M3 9l6-5 6 5" />
      <path d="M4.5 8v6h9V8" />
    </>
  ),
  pending: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M9 5.5V9l2.5 1.5" />
    </>
  ),
  execution: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M7.3 6.3l4 2.7-4 2.7z" />
    </>
  ),
  knowledge: <path d="M3 4.5c1.5-1 4-1 6 0 2-1 4.5-1 6 0v9c-1.5-1-4-1-6 0-2-1-4.5-1-6 0z" />,
  files: <path d="M3 5.5a1 1 0 0 1 1-1h3l1.2 1.5H14a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />,
  memory: (
    <>
      <rect x="3" y="4" width="12" height="4" rx="1" />
      <rect x="3" y="10" width="12" height="4" rx="1" />
      <path d="M6 6h.01M6 12h.01" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 9A5.5 5.5 0 1 0 5 5.3" />
      <path d="M3.5 5v3h3" />
      <path d="M9 6.5V9l2 1.2" />
    </>
  ),
  star: <path d="M9 2.5l2 4.2 4.5.6-3.3 3.2.8 4.5L9 12.8l-4 2.2.8-4.5-3.3-3.2 4.5-.6z" />,
  chat: <path d="M3 4h12v8H7l-3 3v-3H3z" />,
  chevronDown: <path d="M4.5 6.5L9 11l4.5-4.5" />,
  kebab: (
    <>
      <circle cx="9" cy="4.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  mic: (
    <>
      <rect x="7" y="2.5" width="4" height="7" rx="2" />
      <path d="M4.5 8.5a4.5 4.5 0 0 0 9 0M9 13v2.5M6.5 15.5h5" />
    </>
  ),
  globe: (
    <>
      <circle cx="9" cy="9" r="6" />
      <path d="M3 9h12M9 3c1.6 1.8 2.4 3.8 2.4 6s-.8 4.2-2.4 6c-1.6-1.8-2.4-3.8-2.4-6s.8-4.2 2.4-6z" />
    </>
  ),
  paperclip: <path d="M12 5.5l-5.2 5.2a2.2 2.2 0 0 0 3.1 3.1l5.4-5.4a3.6 3.6 0 0 0-5.1-5.1L4.8 8.7a5 5 0 0 0 7.1 7.1" />,
  close: <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />,
  send: <path d="M3 9l12-6-4 6 4 6-12-6z" />,
};

export function NavIcon({ name }) {
  return (
    <svg {...COMMON} aria-hidden="true">
      {PATHS[name] || null}
    </svg>
  );
}
