import { useState } from "react";
import "./cloudConsole.css";
import { ErrorBoundary } from "../shared/ErrorBoundary.jsx";
import { NAV_ITEMS } from "./navConfig.js";
import { PAGE_COMPONENTS } from "./pageRegistry.jsx";
import { SinoFUTBrand } from "../shared/sinofut/SinoFUTBrand.jsx";
import { useSinoFUTContextPublisher } from "../shared/sinofut/sinofutContextStore.js";

/**
 * Operator Cloud 控制台（阶段：三版最终定位）——裸 URL
 * （http://localhost:5173/，不带任何 mode 参数）现在渲染这个应用，
 * 取代原来的 Developer 工作台。管理对象是：
 *   Operator → Tenant → Device → License → Package → Token Account
 *   → Runtime Version → OTA → Health → Support
 * 不是店铺经营数据——Cloud 默认不触达任何私有原始业务数据（见
 * shared/editionPolicy.js 的 PRIVATE_BUSINESS_DATA_ACCESS）。
 *
 * 沿用仓库现有惯例：useState("activePage") 做导航，不引入路由库
 * （与 App.jsx / OperatorPreviewApp.jsx 一致）。
 */

function cloudErrorFallback(error, retry) {
  return (
    <div className="cc-empty">
      <div>该页面渲染失败</div>
      {import.meta.env.DEV ? (
        <div style={{ fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>{String(error?.message ?? error)}</div>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <button type="button" className="cc-btn" onClick={retry}>重试</button>
      </div>
    </div>
  );
}
function CloudConsoleShell() {
  const [activePage, setActivePage] = useState("overview");
  const [params, setParams] = useState({});

  function navigate(pageKey, opts = {}) {
    setActivePage(pageKey);
    setParams(opts);
  }

  const activeItem = NAV_ITEMS.find((i) => i.key === activePage);

  useSinoFUTContextPublisher(`Cloud Center · ${activeItem?.label ?? ""}`);

  return (
    <div className="cc-shell">
      <aside className="cc-sidebar">
        <div className="cc-brand">
          <div className="cc-brand-row">
            <SinoFUTBrand />
            <span className="cc-brand-badge">CLOUD</span>
          </div>
          <div className="cc-brand-tag">设备 · 租户 · 许可 · OTA</div>
        </div>
        <nav className="cc-nav">
          {NAV_ITEMS.map((item) => (
            <button key={item.key} className={`cc-nav-link${activePage === item.key ? " active" : ""}`} onClick={() => navigate(item.key)}>
              <span>{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="cc-nav-footer">
          演示数据 · 不连接真实设备/OTA/计费系统<br />
          开发工作台：?mode=developer
        </div>
      </aside>
      <main className="cc-main" aria-label={activeItem?.label}>
        <div className="cc-topbar">
          <div>
            <h1 className="cc-title">{activeItem?.label}</h1>
            <p className="cc-subtitle">AI Commerce Operator Cloud —— 管理已售出的 Mac mini 设备群，不是店铺日常经营界面</p>
          </div>
          <span className="cc-badge-demo">演示数据</span>
        </div>
        <ErrorBoundary key={activePage} renderFallback={cloudErrorFallback}>
          {(() => {
            const PageComponent = PAGE_COMPONENTS[activePage];
            return PageComponent ? (
              <PageComponent navigate={navigate} params={params} activeKey={activePage} />
            ) : (
              <div className="cc-empty">未找到页面{activePage ? `“${activePage}”` : ""}</div>
            );
          })()}
        </ErrorBoundary>
      </main>
    </div>
  );
}

function CloudConsoleApp() {
  return <CloudConsoleShell />;
}

export default CloudConsoleApp;
