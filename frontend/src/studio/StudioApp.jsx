import { useState } from "react";
import "./studioConsole.css";
import { DEFAULT_NAV_KEY, getStudioNavItemByKey } from "./navConfig.js";
import { StudioSidebar } from "./StudioSidebar.jsx";
import { PAGE_COMPONENTS } from "./pages/index.jsx";
import { ErrorBoundary } from "../shared/ErrorBoundary.jsx";
import { useSinoFUTContextPublisher } from "../shared/sinofut/sinofutContextStore.js";

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

  const activeItem = getStudioNavItemByKey(activePage);
  const PageComponent = PAGE_COMPONENTS[activePage];

  useSinoFUTContextPublisher(`Studio 实验室 · ${activeItem?.label ?? ""}`);

  return (
    <div className="st-shell">
      <StudioSidebar activePage={activePage} onNavigate={navigate} />
      <main className="st-main">
        <div className="st-topbar">
          <div>
            <h1>{activeItem?.label ?? "Studio"}</h1>
            <p className="st-topbar-subtitle">AI Commerce OS Studio —— AI Content Company Operating System · AI内容公司操作系统</p>
          </div>
          <span className="st-demo-badge">{activePage === "workspace" ? "LOCAL · Shared Foundation" : "演示数据"}</span>
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
