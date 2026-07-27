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

/**
 * Founder 内嵌的 Operator 实验室——直接复用 `operator-preview/` 自己
 * 的 `PAGE_COMPONENTS`/`OperatorNav`/`PreviewProvider`（与独立的
 * `OperatorPreviewApp.jsx` 完全同源，本文件对 `operator-preview/`
 * 目录零编辑，遵守 ADR-0002A"只导入、不修改"边界）。容器换成
 * `.fdr-lab-shell`（`height:100%`）而不是 `OperatorPreviewApp.jsx`
 * 的 `.op-shell`（`min-height:100vh`），避免嵌套视口高度撑破
 * Founder 已有界的内容区。
 *
 * `OperatorNav` 的"返回旧版后台"按钮是 `operator-preview/` 内部写死
 * 的文案（不可编辑该文件），这里把它的行为改造成"退出实验室、回到
 * Founder 自己的导航"而不是重新加载整个页面——语义上仍然成立
 * （相对于这个内嵌预览，Founder 自身控制台确实是"外层后台"）。
 */
function OperatorLabShell({ onExit }) {
  const [activePage, setActivePage] = useState("dashboard");
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
              <PageComponent navigate={navigate} detailRoute={detailRoute} />
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

function OperatorLab({ onExit = () => {} }) {
  return (
    <PreviewProvider>
      <OperatorLabShell onExit={onExit} />
    </PreviewProvider>
  );
}

export default OperatorLab;
