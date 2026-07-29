import { useEffect, useRef } from "react";

export function Popover({ open, onClose, anchor, children, align = "start" }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handleKey(event) {
      if (event.key === "Escape") onClose?.();
    }
    function handleOutsideClick(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        onClose?.();
      }
    }
    window.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [open, onClose]);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      {anchor}
      {open ? (
        <div
          className="fdr-popover"
          style={{ top: "100%", marginTop: 4, [align === "end" ? "right" : "left"]: 0 }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
