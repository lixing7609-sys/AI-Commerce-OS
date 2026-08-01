import { useEffect, useRef } from "react";

// 通用悬浮菜单容器 —— 点击外部、按 Esc 自动关闭；绝对定位，不挤压/撑开父级布局。
export function FloatingMenu({ open, onClose, align = "left", className = "", children }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className={`founder-ai-floating-menu align-${align} ${className}`}>
      {children}
    </div>
  );
}
