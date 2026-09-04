import { useEffect } from "react";

export function Drawer({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fdr-drawer-overlay"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        className="fdr-drawer"
        aria-modal="true"
        aria-labelledby="fdr-drawer-title"
        role="dialog"
      >
        <div className="fdr-drawer__header">
          <h3 id="fdr-drawer-title" className="fdr-drawer__title">
            {title}
          </h3>
          <button className="fdr-modal__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="fdr-drawer__body">{children}</div>
        {footer ? <div className="fdr-drawer__footer">{footer}</div> : null}
      </div>
    </div>
  );
}
