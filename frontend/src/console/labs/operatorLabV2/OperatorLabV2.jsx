import { ErrorBoundary } from "../../../shared/ErrorBoundary.jsx";
import { PreviewProvider } from "../../../operator-preview/helpers/PreviewContext.jsx";
import { OPERATOR_V2_PAGE_COMPONENTS } from "./pageRegistry.jsx";

/**
 * Founder 内嵌 Operator 实验室 v2——contentOnly 渲染，不渲染任何
 * 嵌套侧边栏（和 StudioLab.jsx/OperatorLab.jsx 同一个既定原则，见
 * ConsoleSidebar.jsx 顶部注释）。`activePage`/`entityId`/`navigate`/
 * `rootNavigate` 完全由 OperatorLabV2Connected.jsx 从 Founder 自己的
 * ConsoleNavContext 派生，本组件是纯受控组件。
 *
 * `PreviewProvider` 包裹是必须的——本 registry 直接复用了未改动的
 * `operator-preview/pages/{DashboardPage,SecretaryPage,SettingsPage}`
 * 等组件，它们内部用 `usePreview()` 读取 toast/预览态，脱离这个
 * Provider 会直接抛错（不是"可以选择性加"的增强，是这些复用组件的
 * 硬依赖）——和旧版 `OperatorLab.jsx` 的做法一致。
 */
function operatorLabErrorFallback() {
  return <div>该页面渲染失败</div>;
}

export function OperatorLabV2({ activePage, entityId, navigate, rootNavigate }) {
  const PageComponent = OPERATOR_V2_PAGE_COMPONENTS[activePage];

  return (
    <PreviewProvider>
      <ErrorBoundary key={activePage} renderFallback={operatorLabErrorFallback}>
        {PageComponent ? (
          <PageComponent navigate={navigate} rootNavigate={rootNavigate} entityId={entityId} />
        ) : (
          <div>未找到页面{activePage ? `"${activePage}"` : ""}</div>
        )}
      </ErrorBoundary>
    </PreviewProvider>
  );
}
