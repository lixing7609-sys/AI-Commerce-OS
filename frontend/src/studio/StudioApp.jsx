import { useState } from "react";
import "./studioConsole.css";
import { NAV_ITEMS, DEFAULT_NAV_KEY } from "./navConfig.js";
import { PAGE_COMPONENTS } from "./pages/index.jsx";
import { ErrorBoundary } from "../shared/ErrorBoundary.jsx";

/**
 * AI Commerce OS Studio（阶段：四端产品体系 V1）——内容生产与流量
 * 运营平台，与 Founder/Operator/Cloud 并列的第四个正式产品端。
 *
 * 沿用仓库现有惯例：useState("activePage") 做导航，不引入路由库
 * （与 App.jsx / OperatorPreviewApp.jsx / CloudConsoleApp.jsx /
 * ConsoleShell.jsx 一致）。每个页面单独用 ErrorBoundary 包裹——一个
 * 页面渲染失败只替换那一块区域，不会让整个 Studio 变成白屏。
 */

function studioErrorFallback(error, retry) {
  return (
    <div className="st-empty">
      <div className="st-empty__icon">⚠</div>
      <div className="st-empty__message">该页面渲染失败</div>
      {import.meta.env.DEV ? (
        <div style={{ fontSize: 11, marginBottom: 12, fontFamily: "monospace", color: "var(--text-secondary)" }}>
          {String(error?.message ?? error)}
        </div>
      ) : null}
      <button type="button" className="st-btn" onClick={retry}>重试</button>
    </div>
  );
}

function StudioShell() {
  const [activePage, setActivePage] = useState(DEFAULT_NAV_KEY);
  const [params, setParams] = useState({});

  function navigate(pageKey, opts = {}) {
    setActivePage(pageKey);
    setParams(opts);
  }

  const activeItem = NAV_ITEMS.find((i) => i.key === activePage);
  const PageComponent = PAGE_COMPONENTS[activePage];

  return (
    <div className="st-shell">
      <aside className="st-sidebar">
        <div className="st-brand">
          <span>◆</span>
          <div>
            <div>AI Commerce OS</div>
            <span className="st-brand-badge">STUDIO</span>
          </div>
        </div>
        <nav className="st-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`st-nav-link${activePage === item.key ? " active" : ""}`}
              onClick={() => navigate(item.key)}
            >
              <span className="st-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="st-sidebar-footer">
          演示数据 · 内容生产与流量运营
          <br />
          经营者工作台：/operator
        </div>
      </aside>
      <main className="st-main">
        <div className="st-topbar">
          <div>
            <h1>{activeItem?.label ?? "Studio"}</h1>
            <p className="st-topbar-subtitle">AI Commerce OS Studio —— 内容生产、矩阵账号与流量/广告资源经营</p>
          </div>
          <span className="st-demo-badge">演示数据</span>
        </div>
        <div className="st-content">
          <div className="st-content__inner">
            <ErrorBoundary key={activePage} renderFallback={studioErrorFallback}>
              {PageComponent ? (
                <PageComponent navigate={navigate} params={params} />
              ) : (
                <div className="st-empty">
                  <div className="st-empty__icon">○</div>
                  <div className="st-empty__message">未找到页面{activePage ? `"${activePage}"` : ""}</div>
                </div>
              )}
            </ErrorBoundary>
          </div>
        </div>
      </main>
    </div>
  );
}

function StudioApp() {
  return <StudioShell />;
}

export default StudioApp;
