import { useState } from "react";

/**
 * 页面级轻量反馈条——重用 AdResourcesPage 已经验证过的"操作后短暂
 * 文案提示"模式，抽成 hook 避免每个新工作台页面各自复制一份
 * useState+setTimeout。不是全局 toast（Studio 没有引入 ToastProvider
 * 这类跨页面上下文），只作用于调用它的那个页面。
 *
 * 独立成文件而不是留在 uiHelpers.jsx 里——react-refresh/
 * only-export-components 要求一个文件只导出组件，不能和 Pill/Card
 * 这些组件混在同一个文件导出一个 Hook（本仓库其它地方多次踩过这个
 * lint 规则，见 console/nav/navConfig.js 等文件拆分的先例）。
 */
export function useInlineFeedback(durationMs = 2600) {
  const [message, setMessage] = useState(null);
  function show(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(null), durationMs);
  }
  return [message, show];
}
