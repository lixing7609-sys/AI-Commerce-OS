import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// 悬浮菜单容器（portal 版）—— 供列表项内的"更多操作"菜单使用。列表容器
// 本身可滚动（overflow-y: auto），普通的绝对定位子元素会被父级裁剪，所以
// 这里改为挂到 document.body 上、按触发按钮的实时位置用 fixed 定位摆放，
// 不受任何祖先滚动容器裁剪的影响。滚动或调整窗口大小时直接关闭菜单，
// 避免菜单和触发按钮位置脱节。
export function PortalMenu({ open, onClose, anchorRef, align = "right", className = "", children }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 6,
      left: align === "right" ? rect.right : rect.left,
      align,
    });
  }, [open, anchorRef, align]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(e) {
      if (menuRef.current && !menuRef.current.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    }
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    function onScrollOrResize() {
      onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !position) return null;

  const style = {
    position: "fixed",
    top: position.top,
    ...(position.align === "right" ? { right: window.innerWidth - position.left } : { left: position.left }),
  };

  return createPortal(
    <div ref={menuRef} className={`founder-ai-floating-menu ${className}`} style={style}>
      {children}
    </div>,
    document.body
  );
}
