import StudioLab from "./StudioLab.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { DEFAULT_NAV_KEY, isValidStudioNavKey } from "../../studio/navConfig.js";

/**
 * 薄适配器——把 Founder 自己的 `ConsoleNavContext`
 * （`{module:"studioLab", subView, entityId, tab}`）接进 contentOnly
 * 的 `StudioLab.jsx`（阶段 M8c）。`subView` 同时承担"旧 内容中心/
 * AI直播中心/流量网络中心 一级菜单重定向到 Studio 实验室对应子页面"
 * 这个职责——见 navConfig.js 的 `MODULE_REDIRECTS`。
 *
 * 阶段 Studio V3 Integration：Founder 的导航状态只有 4 个固定字段
 * （module/subView/entityId/tab，见 useConsoleNav.js），不像独立
 * Studio 的 `navigate(pageKey, opts)` 可以带任意 opts。这里把最常用
 * 的两个 Studio 内部参数映射过去：`entityId` 承载 `projectId`（与
 * Operator 的 `entityId`/`detailRoute` 同一个约定），`tab==="create"`
 * 作为"直接打开新建项目弹窗"的哨兵值。`presetTrendId`/`presetType`/
 * `presetIpId` 这类一次性预填参数暂不通过 URL 往返——Founder 内点击
 * "新建"仍然会打开真实可用的创建表单，只是不会预填热点/类型/IP，
 * 需要在表单里手动选择，是已知且诚实记录的差异，不是按钮失效。
 */
export function StudioLabConnected() {
  const { subView, entityId, tab, navigate } = useConsoleNavContext();
  const activePage = subView && isValidStudioNavKey(subView) ? subView : DEFAULT_NAV_KEY;
  const params = { projectId: entityId || undefined, openCreate: tab === "create" || undefined };

  function handleNavigate(pageKey, opts = {}) {
    navigate("studioLab", {
      subView: pageKey,
      entityId: opts.projectId ?? null,
      tab: opts.openCreate ? "create" : null,
    });
  }

  return <StudioLab activePage={activePage} params={params} onNavigate={handleNavigate} />;
}
