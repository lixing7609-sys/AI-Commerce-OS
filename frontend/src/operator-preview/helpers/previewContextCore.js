import { createContext, useContext } from "react";

/**
 * PreviewContext 的非组件部分（Context 对象、常量、hook），单独
 * 拆出一个纯 .js 文件——PreviewContext.jsx 只导出 PreviewProvider
 * 组件本身，满足 react-refresh/only-export-components 规则，也
 * 避免组件文件和普通常量/hook 混在一起。
 */

export const ALL_SHOPS_SCOPE = "all";
export const UNASSIGNED_SHOP_SCOPE = "unassigned";

export const PreviewContext = createContext(null);

export function usePreview() {
  const ctx = useContext(PreviewContext);
  if (!ctx) {
    throw new Error("usePreview 必须在 PreviewProvider 内部使用");
  }
  return ctx;
}
