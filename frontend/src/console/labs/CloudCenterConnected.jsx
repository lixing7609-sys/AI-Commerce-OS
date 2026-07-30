import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { ErrorBoundary } from "../../shared/ErrorBoundary.jsx";
import { PAGE_COMPONENTS } from "../../cloud/pageRegistry.jsx";
import { NAV_ITEMS as CLOUD_NAV_ITEMS, isValidCloudNavKey } from "../../cloud/navConfig.js";
import { PageHeader } from "../kit/PageHeader.jsx";
import { DemoBadge } from "../kit/StatusPill.jsx";

const DEFAULT_CLOUD_PAGE = "overview";

// 这四个子页（Devices/OTA/License/节点调度）来自独立 /cloud 应用共享的
// pageRegistry.jsx，组件本体里没有 Founder kit 的 PageHeader——独立应用
// 靠 CloudConsoleApp.jsx 自己的 <aside> 壳顶栏显示中文标题，但这里
// （Founder 内嵌模式）刻意不渲染那个壳（见下方注释），所以由这一层补上
// 统一的中文标题 + 职责说明 + 演示标识，key 严格取自 cloud/navConfig.js
// 的权威列表，不在这里另起一份文案巧合重复的标签。
const PAGE_SUBTITLES = {
  devices: "查看每台 Mac mini 设备的在线状态、版本、许可证与 Token 状态，发起远程诊断授权",
  otaSupport: "管理设备群的版本发布、灰度比例、更新进度与暂停/继续/回滚",
  licenses: "管理经营者许可证的授权能力、生效/到期时间与暂停/续期/转移",
  distributedScheduling: "查看设备算力资源池与调度任务——架构预留，distributedCompute.enabled 恒为 false",
  overview: "云端设备群聚合指标总览（旧入口，仍可通过深链访问）",
  operators: "经营者 / 租户列表（已并入设备管理的“经营者”标签页）",
  tokenMetering: "全平台 Token 消耗趋势（已并入 Token 中心的“Token 计量”标签页）",
};

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
  const pageLabel = CLOUD_NAV_ITEMS.find((item) => item.key === activePage)?.label ?? "Cloud Center";

  return (
    <div>
      <PageHeader title={pageLabel} subtitle={PAGE_SUBTITLES[activePage] ?? ""} actions={<DemoBadge />} />
      <ErrorBoundary key={activePage} renderFallback={cloudCenterErrorFallback}>
        {PageComponent ? (
          <PageComponent navigate={handleNavigate} params={{ operatorId: entityId ?? undefined }} activeKey={activePage} />
        ) : (
          <div>未找到页面{activePage ? `"${activePage}"` : ""}</div>
        )}
      </ErrorBoundary>
    </div>
  );
}
