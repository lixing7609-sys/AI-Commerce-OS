import StudioLab from "./StudioLab.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { DEFAULT_NAV_KEY, isValidStudioNavKey } from "../../studio/navConfig.js";

/**
 * 薄适配器——把 Founder 自己的 `ConsoleNavContext`
 * （`{module:"studioLab", subView}`）接进 contentOnly 的
 * `StudioLab.jsx`（阶段 M8c）。`subView` 同时承担"旧 内容中心/
 * AI直播中心/流量网络中心 一级菜单重定向到 Studio 实验室对应子页面"
 * 这个职责——见 navConfig.js 的 `MODULE_REDIRECTS`。
 */
export function StudioLabConnected() {
  const { subView, navigate } = useConsoleNavContext();
  const activePage = subView && isValidStudioNavKey(subView) ? subView : DEFAULT_NAV_KEY;

  function handleNavigate(pageKey, opts = {}) {
    navigate("studioLab", { subView: pageKey, tab: opts.tab });
  }

  return <StudioLab activePage={activePage} params={{}} onNavigate={handleNavigate} />;
}
