import { useState } from "react";
import "./operatorPreview.css";

import OperatorNav from "./components/OperatorNav";
import SecretaryPanel from "./components/SecretaryPanel";
import { PreviewProvider } from "./helpers/PreviewContext";
import { usePreview } from "./helpers/previewContextCore";
import { getNavItemByKey } from "./helpers/navigation";
import { scopeLabelFor } from "./helpers/formatters";

import DashboardPage from "./pages/DashboardPage";
import ShopsPage from "./pages/ShopsPage";
import SecretaryPage from "./pages/SecretaryPage";
import DeliverablesPage from "./pages/DeliverablesPage";
import BusinessMemoryPage from "./pages/BusinessMemoryPage";
import AIGrowthPage from "./pages/AIGrowthPage";
import SettingsPage from "./pages/SettingsPage";

const COMPANY_NAME = "一人公司";

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

  return (
    <div className="op-shell">
      <div className="op-preview-banner">
        <strong>经营者版产品原型</strong>
        <span>当前为产品原型，部分经营数据仅用于界面体验，不代表真实店铺数据。</span>
      </div>

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
          {activePage === "dashboard" && (
            <DashboardPage onNavigate={navigate} />
          )}
          {activePage === "shops" && <ShopsPage onNavigate={navigate} />}
          {activePage === "secretary" && (
            <SecretaryPage onNavigate={navigate} initialDetail={detailRoute} />
          )}
          {activePage === "deliverables" && (
            <DeliverablesPage onNavigate={navigate} initialDetail={detailRoute} />
          )}
          {activePage === "memory" && <BusinessMemoryPage />}
          {activePage === "growth" && <AIGrowthPage />}
          {activePage === "settings" && <SettingsPage />}
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
