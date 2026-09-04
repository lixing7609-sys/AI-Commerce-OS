import { useState } from "react";
import "./operatorPreview.css";

import OperatorNav from "./components/OperatorNav";
import SecretaryPanel from "./components/SecretaryPanel";
import { PreviewProvider } from "./helpers/PreviewContext";
import { usePreview } from "./helpers/previewContextCore";
import { getNavItemByKey, isValidNavKey } from "./helpers/navigation";
import { scopeLabelFor } from "./helpers/formatters";
import { ErrorBoundary } from "../shared/ErrorBoundary.jsx";
import { PAGE_COMPONENTS } from "./pageRegistry.jsx";
import { useSinoFUTContextPublisher } from "../shared/sinofut/sinofutContextStore.js";

const COMPANY_NAME = "一人公司";

function renderErrorFallback(error, retry) {
  return (
    <div className="op-empty-state large">
      <div>页面渲染失败</div>
      {import.meta.env.DEV ? (
        <div style={{ fontSize: 12, marginTop: 4, fontFamily: "monospace" }}>{String(error?.message ?? error)}</div>
      ) : null}
      <div style={{ marginTop: 12 }}>
        <button type="button" className="op-btn" onClick={retry}>重试</button>
      </div>
    </div>
  );
}

function UnknownPageState({ pageKey }) {
  return (
    <div className="op-empty-state large">
      <div>未找到页面{pageKey ? `“${pageKey}”` : ""}</div>
    </div>
  );
}

function OperatorPreviewShell() {
  const [activePage, setActivePage] = useState("dashboard");
  const [detailRoute, setDetailRoute] = useState(null); // { kind: 'work'|'deliverable', id }
  const { shopScope, shops, toastMessage } = usePreview();

  function navigate(pageKey, options = {}) {
    setActivePage(pageKey);
    setDetailRoute(options.detail ?? null);
  }

  function handleBackToLegacy() {
    window.location.href = window.location.pathname;
  }

  const scopeLabel = scopeLabelFor(shopScope, shops);
  const activeNavItem = getNavItemByKey(activePage);
  const PageComponent = isValidNavKey(activePage) ? PAGE_COMPONENTS[activePage] : null;

  useSinoFUTContextPublisher(`Operator 实验室 · ${activeNavItem?.label ?? ""}`);

  return (
    <div className="op-shell">
      <div className="op-body">
        <OperatorNav
          activePage={activePage}
          onNavigate={(key) => navigate(key)}
          companyName={COMPANY_NAME}
          scopeLabel={scopeLabel}
          statusOk
          onBackToLegacy={handleBackToLegacy}
        />

        <main className="op-main" aria-label={activeNavItem?.label}>
          <ErrorBoundary key={activePage} renderFallback={renderErrorFallback}>
            {PageComponent ? (
              <PageComponent navigate={navigate} detailRoute={detailRoute} />
            ) : (
              <UnknownPageState pageKey={activePage} />
            )}
          </ErrorBoundary>
        </main>
      </div>

      <SecretaryPanel />

      {toastMessage && <div className="op-toast">{toastMessage}</div>}
    </div>
  );
}

function OperatorPreviewApp() {
  return (
    <PreviewProvider>
      <OperatorPreviewShell />
    </PreviewProvider>
  );
}

export default OperatorPreviewApp;
