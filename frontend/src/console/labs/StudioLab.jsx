import { useState } from "react";
import "../../studio/studioConsole.css";
import "./labs.css";
import { NAV_ITEMS, DEFAULT_NAV_KEY } from "../../studio/navConfig.js";
import { PAGE_COMPONENTS } from "../../studio/pages/index.jsx";
import { ErrorBoundary } from "../../shared/ErrorBoundary.jsx";

/**
 * Founder 内嵌的 Studio 实验室——不重建 Studio 的任何页面代码，直接
 * 复用 Studio 自己的 `NAV_ITEMS`/`PAGE_COMPONENTS` 权威列表（与独立
 * 的 `studio/StudioApp.jsx` 完全同源）。唯一的区别是外层容器：
 * `StudioApp.jsx` 的 `.st-shell` 用 `height:100vh` 撑满整个视口，
 * 这里改用 `.fdr-lab-shell`（`height:100%`）把同一套内部结构装进
 * Founder 已经有界的内容区，避免嵌套视口高度导致的双重滚动（本会话
 * Founder 滚动回归修复留下的教训，见 labs.css 顶部注释）。
 */
function StudioLab() {
  const [activePage, setActivePage] = useState(DEFAULT_NAV_KEY);
  const [params, setParams] = useState({});

  function navigate(pageKey, opts = {}) {
    setActivePage(pageKey);
    setParams(opts);
  }

  const activeItem = NAV_ITEMS.find((i) => i.key === activePage);
  const PageComponent = PAGE_COMPONENTS[activePage];

  return (
    <div className="fdr-lab-shell">
      <div className="fdr-lab-banner">
        <span>研发实验室 · 完整复用 Studio 产品端页面（同一套代码，非拷贝）</span>
        <strong>{activeItem?.label ?? "Studio"}</strong>
      </div>
      <div className="fdr-lab-body">
        <aside className="st-sidebar">
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
        </aside>
        <main className="st-main" style={{ minHeight: 0 }}>
          <div className="st-content">
            <div className="st-content__inner">
              <ErrorBoundary key={activePage} renderFallback={() => <div className="st-empty">该页面渲染失败</div>}>
                {PageComponent ? (
                  <PageComponent navigate={navigate} params={params} />
                ) : (
                  <div className="st-empty">
                    <div className="st-empty__message">未找到页面{activePage ? `"${activePage}"` : ""}</div>
                  </div>
                )}
              </ErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default StudioLab;
