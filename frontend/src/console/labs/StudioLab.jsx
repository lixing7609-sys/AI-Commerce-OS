import "../../studio/studioConsole.css";
import { PAGE_COMPONENTS } from "../../studio/pages/index.jsx";
import { isValidStudioNavKey, getStudioNavItemByKey } from "../../studio/navConfig.js";
import { ErrorBoundary } from "../../shared/ErrorBoundary.jsx";

/**
 * Founder 内嵌的 Studio 实验室——contentOnly 渲染（阶段 M8c Founder
 * Unified Product Navigation）。
 *
 * 上一版（M8b）在 Founder 内容区里又渲染了一整套 Studio 自己的侧边栏
 * （`.st-sidebar`/`st-nav-link`）——owner 看到实际截图后明确否决了
 * 这个方向。修正：Studio 完整导航（`studio/navConfig.js` 的
 * `NAV_ITEMS`）现在直接展开在 Founder 自己唯一的左侧导航树里（见
 * shell/ConsoleSidebar.jsx），这里只负责渲染"当前子项对应的那一个
 * Studio 页面组件"——不渲染 Studio 自己的侧边栏，不渲染
 * `.st-shell`/`.st-sidebar`/`.st-main`，也不再需要给内嵌产品套一个
 * 有界容器防止撑高页面（那套技巧本身是为了容纳一个不该存在的内嵌
 * 侧边栏；Studio 页面组件自己用 `.st-card`/`.st-grid` 这类不依赖外层
 * `.st-content` 容器的类名，直接放进 Founder 已有 padding 的
 * `.fdr-content` 里即可，不会双重内边距）。
 *
 * `activePage`/`onNavigate` 由 `StudioLabConnected.jsx` 接入 Founder
 * 自己的 `ConsoleNavContext`（`{module:"studioLab", subView}`）
 * 控制——这个组件是纯受控组件，"当前子项高亮"、"刷新后恢复"、
 * "浏览器前进后退"全部继承 Founder 导航状态已有的 URL 同步机制。
 *
 * `PAGE_COMPONENTS` 仍然直接从 `studio/pages/index.jsx` 导入——和
 * 独立 Studio（`StudioApp.jsx`）完全同源，零分叉。
 *
 * 页面标题：独立 Studio 的页面标题（`<h1>`）本来渲染在 `StudioApp.jsx`
 * 自己的 `.st-topbar` 壳层里，不是每个页面组件自己带的——contentOnly
 * 去掉了那层壳，所以这里补一行等价的标题，否则像"AI 短剧"这类自己
 * 不带标题的页面在 Founder 里会失去"我在看哪个页面"的视觉锚点
 * （Founder 侧边栏的高亮子项已经能说明，但页面内容区域本身也应该
 * 有）。
 */
function StudioLab({ activePage, params = {}, onNavigate }) {
  const PageComponent = isValidStudioNavKey(activePage) ? PAGE_COMPONENTS[activePage] : null;
  const activeItem = getStudioNavItemByKey(activePage);

  return (
    <div>
      {activeItem ? <h1 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 800 }}>{activeItem.label}</h1> : null}
      <ErrorBoundary key={activePage} renderFallback={() => <div className="st-empty">该页面渲染失败</div>}>
        {PageComponent ? (
          <PageComponent navigate={onNavigate} params={params} />
        ) : (
          <div className="st-empty">
            <div className="st-empty__message">未找到页面{activePage ? `"${activePage}"` : ""}</div>
          </div>
        )}
      </ErrorBoundary>
    </div>
  );
}

export default StudioLab;
