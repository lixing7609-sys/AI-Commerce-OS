import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * Shared by ConsoleSidebar.jsx (real navigation) and
 * NavigationShellDemo.jsx (Design DNA showcase demonstrator) — both
 * reuse the real .fdr-sidebar CSS class, which sets `overflow:
 * hidden` (as does the real shell's .fdr-root), so any collapsed-mode
 * flyout content must portal to document.body rather than position
 * relative/absolute inside the sidebar — caught via actual browser
 * testing (the flyout rendered in the DOM but was invisible in BOTH
 * places until this was extracted and shared, rather than fixed once
 * and silently re-broken in the demo's own separate copy).
 *
 * `rect` is captured synchronously in the caller's click handler
 * (`event.currentTarget.getBoundingClientRect()`), not measured here
 * inside an effect — the repo's React Compiler lint rule forbids
 * calling setState directly inside an effect body.
 */
export function SidebarFlyout({ getAnchorEl, rect, onClose, children }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!rect) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    function handleOutsideClick(event) {
      const currentAnchor = getAnchorEl();
      if (
        panelRef.current && !panelRef.current.contains(event.target) &&
        currentAnchor && !currentAnchor.contains(event.target)
      ) {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [rect, onClose, getAnchorEl]);

  if (!rect) return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fdr-sidebar__flyout"
      style={{ position: "fixed", left: rect.right + 8, top: rect.top, zIndex: 400 }}
    >
      {children}
    </div>,
    document.body
  );
}
