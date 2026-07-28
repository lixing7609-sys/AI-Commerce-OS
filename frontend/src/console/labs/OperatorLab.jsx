import { useState } from "react";
import "../../operator-preview/operatorPreview.css";
import "./labs.css";
import OperatorNav from "../../operator-preview/components/OperatorNav";
import SecretaryPanel from "../../operator-preview/components/SecretaryPanel";
import { PreviewProvider } from "../../operator-preview/helpers/PreviewContext";
import { usePreview } from "../../operator-preview/helpers/previewContextCore";
import { getNavItemByKey, isValidNavKey } from "../../operator-preview/helpers/navigation";
import { scopeLabelFor } from "../../operator-preview/helpers/formatters";
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
 * Founder 内嵌的 Operator 实验室——直接复用 `operator-preview/` 自己
 * 的 `PAGE_COMPONENTS`/`OperatorNav`/`PreviewProvider`（与独立的
 * `OperatorPreviewApp.jsx` 完全同源）。容器换成 `.fdr-lab-shell`
 * （`height:100%`）而不是 `OperatorPreviewApp.jsx` 的 `.op-shell`
 * （`min-height:100vh`），避免嵌套视口高度撑破 Founder 已有界的
 * 内容区。
 *
 * 阶段 M8 Founder Product Shell Consolidation：`operator-preview/`
 * 不再是"只导入、不修改"的冻结原型（ADR-0002A 的保护期已经随这次
 * 显式的架构收口审查结束——见该 ADR 规则 4：角色已文档化、替代
 * 路径已存在、已完成对比、owner 已明确要求本次收口），而是升级为
 * Founder 和独立 Operator 共用的唯一真源注册表；这个文件本身只做
 * 允许的那一件事——通过 `founderOverlay` prop 注入 Founder 专属的
 * 研发增强层，不复制任何页面代码。
 *
 * `OperatorNav` 的"返回旧版后台"按钮是 `operator-preview/` 内部写死
 * 的文案（不可编辑该文件），这里把它的行为改造成"退出实验室、回到
 * Founder 自己的导航"而不是重新加载整个页面——语义上仍然成立
 * （相对于这个内嵌预览，Founder 自身控制台确实是"外层后台"）。
 */
function OperatorLabShell({ onExit, initialPage }) {
  const [activePage, setActivePage] = useState(initialPage && isValidNavKey(initialPage) ? initialPage : "dashboard");
  const [detailRoute, setDetailRoute] = useState(null);
  const { shopScope, shops } = usePreview();

  function navigate(pageKey, options = {}) {
    setActivePage(pageKey);
    setDetailRoute(options.detail ?? null);
  }

  const scopeLabel = scopeLabelFor(shopScope, shops);
  const activeNavItem = getNavItemByKey(activePage);
  const PageComponent = isValidNavKey(activePage) ? PAGE_COMPONENTS[activePage] : null;

  return (
    <div className="fdr-lab-shell">
      <div className="fdr-lab-banner">
        <span>研发实验室 · 完整复用 Operator 产品端页面（同一套代码，非拷贝）</span>
        <strong>{activeNavItem?.label ?? "Operator"}</strong>
      </div>
      <div className="fdr-lab-body">
        <OperatorNav
          activePage={activePage}
          onNavigate={(key) => navigate(key)}
          companyName="Founder 研发实验室"
          scopeLabel={scopeLabel}
          statusOk
          onBackToLegacy={onExit}
        />
        <main className="op-main" aria-label={activeNavItem?.label} style={{ minHeight: 0 }}>
          <ErrorBoundary key={activePage} renderFallback={() => <div>该页面渲染失败</div>}>
            {PageComponent ? (
              <PageComponent navigate={navigate} detailRoute={detailRoute} founderOverlay={FOUNDER_OVERLAY} />
            ) : (
              <div>未找到页面{activePage ? `"${activePage}"` : ""}</div>
            )}
          </ErrorBoundary>
        </main>
      </div>
      <SecretaryPanel />
    </div>
  );
}

function OperatorLab({ onExit = () => {}, initialPage }) {
  return (
    <PreviewProvider>
      <OperatorLabShell onExit={onExit} initialPage={initialPage} />
    </PreviewProvider>
  );
}

export default OperatorLab;
