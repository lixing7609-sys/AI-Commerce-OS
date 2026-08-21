export const WORKSPACE_ICON_SIZE = 18;
export const WORKSPACE_ICON_STROKE = 1.7;

function Icon({ children, size = WORKSPACE_ICON_SIZE, className }) {
  return <svg
    aria-hidden="true"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={WORKSPACE_ICON_STROKE}
    strokeLinecap="round"
    strokeLinejoin="round"
  >{children}</svg>;
}

export function SidebarIcon({ expanded = false }) {
  return <Icon><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 3v18" /><path d={expanded ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} /></Icon>;
}

export function ComposeIcon() {
  return <Icon><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z" /></Icon>;
}

export function LibraryIcon() {
  return <Icon><path d="M4 19.5V5a2 2 0 0 1 2-2h11.5A2.5 2.5 0 0 1 20 5.5V19" /><path d="M6 17h14" /><path d="M8 7h8" /></Icon>;
}

export function SearchIcon() {
  return <Icon><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></Icon>;
}

export function FolderIcon() {
  return <Icon><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" /></Icon>;
}

export function FolderPlusIcon() {
  return <Icon><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H9l2 2h7.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" /><path d="M12 10v5M9.5 12.5h5" /></Icon>;
}

export function ConversationIcon() {
  return <Icon><path d="M21 15a3 3 0 0 1-3 3H8l-5 3V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3Z" /></Icon>;
}

export function SettingsIcon() {
  return <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.39.28.64.7.6 1.1v.3H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z" /></Icon>;
}

export function PanelWidthIcon() {
  return <Icon><path d="M8 8 4 12l4 4" /><path d="m16 8 4 4-4 4" /><path d="M4 12h16" /></Icon>;
}
