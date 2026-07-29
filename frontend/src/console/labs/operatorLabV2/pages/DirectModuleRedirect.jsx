import { useEffect } from "react";

/**
 * 见 ../pageRegistry.jsx 顶部注释——"商品/订单/客服/审批"复用的是
 * Founder 自己会读全局 `subView` 的顶层模块组件，不能塞进
 * `operatorLab` 的 subView 渲染，这里立刻跳到它们自己的顶层模块。
 */
export function DirectModuleRedirect({ rootNavigate, moduleKey }) {
  useEffect(() => {
    rootNavigate(moduleKey);
  }, [rootNavigate, moduleKey]);
  return null;
}
