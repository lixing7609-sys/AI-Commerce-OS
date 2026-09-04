import { OperatorLabV2 } from "./operatorLabV2/OperatorLabV2.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { OPERATOR_V2_PAGE_COMPONENTS } from "./operatorLabV2/pageRegistry.jsx";

const DEFAULT_OPERATOR_PAGE = "workbench";

/**
 * 薄适配器——把 Founder 自己的 `ConsoleNavContext`
 * （`{module:"operatorLab", subView, entityId}`）接进 contentOnly 的
 * `OperatorLabV2.jsx`。和 OperatorLabConnected.jsx（旧版，复用
 * operator-preview registry）同一个模式，区别只是这里指向 Batch 2
 * 新建的 Founder 专属 registry。
 *
 * 提供两个 navigate：`navigate`（页面内部子导航，始终停留在
 * `module:"operatorLab"`）和 `rootNavigate`（Founder 顶层 navigate，
 * 未经改造，供"内容"这类需要跳出 Operator 实验室、落到 Studio 实验
 * 室的场景使用——不能用 `navigate` 代替，否则会把目标模块错误地
 * 挂在 `operatorLab` 的 subView 上）。
 */
export function OperatorLabV2Connected() {
  const { subView, entityId, navigate: rootNavigate } = useConsoleNavContext();
  const activePage = subView && OPERATOR_V2_PAGE_COMPONENTS[subView] ? subView : DEFAULT_OPERATOR_PAGE;

  function handleNavigate(pageKey, options = {}) {
    rootNavigate("operatorLab", { subView: pageKey, entityId: options.entityId ?? options.detail ?? null });
  }

  return <OperatorLabV2 activePage={activePage} entityId={entityId} navigate={handleNavigate} rootNavigate={rootNavigate} />;
}
