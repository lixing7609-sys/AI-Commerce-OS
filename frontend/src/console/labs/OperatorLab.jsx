import "../../operator-preview/operatorPreview.css";
import { PreviewProvider } from "../../operator-preview/helpers/PreviewContext";
import { usePreview } from "../../operator-preview/helpers/previewContextCore";
import { isValidNavKey } from "../../operator-preview/helpers/navigation";
import { PAGE_COMPONENTS } from "../../operator-preview/pageRegistry.jsx";
import { ErrorBoundary } from "../../shared/ErrorBoundary.jsx";
import { STORE_DETAIL_EXTRA_TABS } from "../modules/storeCenter/storeDetailExtraTabs.jsx";

/**
 * Founder 专属的研发/诊断增强层——只在这里（Founder 宿主）注入，
 * 独立 Operator 永远拿不到。目前只有店铺详情页的"平台连接器"标签
 * 页；未来任何新增的 Founder-only 增强都加在这一个对象里，不允许
 * 散落到 operator-preview/ 内部条件判断。
 */
const FOUNDER_OVERLAY = {
  storeExtraDetailTabs: STORE_DETAIL_EXTRA_TABS,
};

/**
 * Founder 内嵌的 Operator 实验室——contentOnly 渲染（阶段 M8c Founder
 * Unified Product Navigation）。
 *
 * 上一版（M8b）在 Founder 内容区里又渲染了一整套 `OperatorNav`
 * 侧边栏——owner 看到实际截图后明确否决了这个方向："点击 Founder
 * 左侧的 Operator 实验室后，右侧又出现完整 Operator 侧边栏和页面
 * 壳"。修正：Operator 完整导航（OPERATOR_NAV_ITEMS）现在直接展开
 * 在 Founder 自己唯一的左侧导航树里（见 shell/ConsoleSidebar.jsx），
 * 这里只负责渲染"当前子项对应的那一个 Operator 页面组件"——不渲染
 * `OperatorNav`、不渲染 `.op-shell`/`.op-body`/`.op-sidebar`，也不
 * 再需要 labs.css 那套"给内嵌产品套一个有界容器防止撑高页面"的技巧
 * （那套技巧本身就是为了容纳一个不该存在的内嵌侧边栏）。
 *
 * `activePage`/`detailRoute`/`onNavigate` 现在完全由 Founder 自己的
 * `ConsoleNavContext`（`{module:"operatorLab", subView, entityId}`）
 * 控制（见 OperatorLabConnected.jsx）——这个组件本身是纯受控组件，
 * 不再有内部 `useState(activePage)`，所以"当前子项高亮"、"刷新后
 * 恢复"、"浏览器前进后退"全部自动继承 Founder 导航状态已有的 URL
 * 同步机制，不需要重新实现一遍。
 *
 * `PAGE_COMPONENTS` 仍然直接从 `operator-preview/pageRegistry.jsx`
 * 导入——和独立 Operator（`OperatorPreviewApp.jsx`）完全同源，零
 * 分叉。`founderOverlay` 是唯一允许的宿主差异注入点。
 *
 * 不渲染 `SecretaryPanel`（右下角浮动"问Operator秘书"入口）——
 * Founder 场景下 Operator秘书已经是侧边栏里一个可直接点达的真实
 * 页面，浮动入口在这里是多余的重复交互；独立 Operator
 * （`OperatorPreviewApp.jsx`）仍然渲染它，因为那里没有等价的常驻
 * 导航项可以替代快速呼出。
 */
function OperatorLabContent({ activePage, detailRoute, onNavigate }) {
  const { toastMessage } = usePreview();
  const PageComponent = isValidNavKey(activePage) ? PAGE_COMPONENTS[activePage] : null;

  return (
    <>
      <ErrorBoundary key={activePage} renderFallback={() => <div>该页面渲染失败</div>}>
        {PageComponent ? (
          <PageComponent navigate={onNavigate} detailRoute={detailRoute} founderOverlay={FOUNDER_OVERLAY} />
        ) : (
          <div>未找到页面{activePage ? `"${activePage}"` : ""}</div>
        )}
      </ErrorBoundary>
      {toastMessage && <div className="op-toast">{toastMessage}</div>}
    </>
  );
}

function OperatorLab({ activePage, detailRoute = null, onNavigate }) {
  return (
    <PreviewProvider>
      <OperatorLabContent activePage={activePage} detailRoute={detailRoute} onNavigate={onNavigate} />
    </PreviewProvider>
  );
}

export default OperatorLab;
