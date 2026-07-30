import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { ErrorBoundary } from "../../shared/ErrorBoundary.jsx";
import { PAGE_COMPONENTS } from "../../cloud/pageRegistry.jsx";
import { isValidCloudNavKey } from "../../cloud/navConfig.js";

const DEFAULT_CLOUD_PAGE = "overview";

function cloudCenterErrorFallback() {
  return <div>该页面渲染失败</div>;
}

/**
 * Founder 内嵌 Cloud Center——阶段 Founder Full-System v3 Batch 2
 * §2。原来裸 URL 默认打开的 Operator Cloud 控制台（设备/租户/许可/
 * Token计量/OTA/分布式调度），现在作为 Founder 侧边栏的一个分组存在
 * （不再占用裸 URL 默认入口，见 editions/editionConfig.js），
 * contentOnly 渲染，和 Operator/Studio 实验室同一个模式：不渲染
 * `cloud/CloudConsoleApp.jsx` 自己的 `<aside className="cc-sidebar">`
 * 壳（那会变成 Founder 侧边栏下面又长出一套 Cloud 侧边栏），只从
 * `cloud/pageRegistry.jsx` 里查表渲染当前子页面组件——这份 registry
 * 和独立 `/cloud` 应用共用同一份实现，零分叉。
 */
export function CloudCenterConnected() {
  const { subView, entityId, navigate } = useConsoleNavContext();
  const activePage = subView && isValidCloudNavKey(subView) ? subView : DEFAULT_CLOUD_PAGE;

  function handleNavigate(pageKey, opts = {}) {
    navigate("cloudCenter", { subView: pageKey, entityId: opts.operatorId ?? null });
  }

  const PageComponent = PAGE_COMPONENTS[activePage];

  return (
    <ErrorBoundary key={activePage} renderFallback={cloudCenterErrorFallback}>
      {PageComponent ? (
        <PageComponent navigate={handleNavigate} params={{ operatorId: entityId ?? undefined }} activeKey={activePage} />
      ) : (
        <div>未找到页面{activePage ? `"${activePage}"` : ""}</div>
      )}
    </ErrorBoundary>
  );
}
