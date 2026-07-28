import OperatorLab from "./OperatorLab.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { isValidNavKey } from "../../operator-preview/helpers/navigation.js";

const DEFAULT_OPERATOR_PAGE = "dashboard";

/**
 * 薄适配器——把 Founder 自己的 `ConsoleNavContext`
 * （`{module:"operatorLab", subView, entityId}`）接进 contentOnly 的
 * `OperatorLab.jsx`（阶段 M8c，取代旧版 `OperatorLabWithExit.jsx`：
 * 不再需要"返回旧版后台"退出逻辑，因为 Founder 侧边栏本身现在就是
 * 唯一常驻导航，没有需要"退出"的第二套壳可言）。
 *
 * 这是 Founder 侧边栏子项点击（见 shell/ConsoleSidebar.jsx）和
 * Operator 页面内部"继续导航"（例如 Dashboard 点一个统计卡跳到
 * "订单"页）唯一的状态桥梁——`OperatorLab.jsx` 本身不依赖 Founder
 * 的导航上下文，保持可以被未来任何宿主复用。
 *
 * `subView` 同时承担"旧 storeCenter 路由重定向到 Operator 实验室的
 * 店铺页"这个职责——见 navConfig.js 的 MODULE_REDIRECTS。
 */
export function OperatorLabConnected() {
  const { subView, entityId, navigate } = useConsoleNavContext();
  const activePage = subView && isValidNavKey(subView) ? subView : DEFAULT_OPERATOR_PAGE;

  function handleNavigate(pageKey, options = {}) {
    navigate("operatorLab", { subView: pageKey, entityId: options.detail ?? null });
  }

  return <OperatorLab activePage={activePage} detailRoute={entityId} onNavigate={handleNavigate} />;
}
