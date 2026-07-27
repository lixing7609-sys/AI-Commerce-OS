import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import "./styles/theme.css";
import App from './App.jsx'
import OperatorPreviewApp from './operator-preview/OperatorPreviewApp.jsx'
import ConsoleApp from './console/ConsoleApp.jsx'
import CloudConsoleApp from './cloud/CloudConsoleApp.jsx'
import StudioApp from './studio/StudioApp.jsx'
import { EDITIONS, getActiveEdition } from './editions/editionConfig.js'
import { ErrorBoundary } from './shared/ErrorBoundary.jsx'

const activeEdition = getActiveEdition()

function renderForEdition(edition) {
  if (edition === EDITIONS.OPERATOR) {
    return <OperatorPreviewApp />
  }

  if (edition === EDITIONS.FOUNDER_OPERATOR) {
    return <ConsoleApp />
  }

  if (edition === EDITIONS.OPERATOR_CLOUD) {
    return <CloudConsoleApp />
  }

  if (edition === EDITIONS.STUDIO) {
    return <StudioApp />
  }

  if (edition === EDITIONS.DEVELOPER) {
    return <App />
  }

  // No committed frontend exists yet for this Edition (e.g. Device
  // Admin) — ADR-0002 Migration Plan Phase 2. Falling through to the
  // Developer app here would leak Task/Runtime/Agent concepts to an
  // Edition that must never see them.
  return <p>This edition ({edition}) does not have a frontend build yet.</p>
}

// 顶层安全网（阶段"四端产品体系 V1"新增）：四个产品端各自的 Shell
// 内部已经在模块/页面级别使用 ErrorBoundary（Founder 的
// ConsoleShell、Cloud 的 CloudConsoleShell、Studio 的 StudioShell 都
// 是"只替换当前模块，不拖垮整个应用"），但在那一层生效之前——比如
// Shell 组件自身的顶层渲染路径出错——之前完全没有防护，会导致整棵
// React 树被卸载成白屏。这里加一层不知道任何 Edition 视觉细节的
// 中性兜底，只在"连 Shell 自己的错误边界都没接住"时才会显示。
function topLevelFallback(error, retry) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 18, marginBottom: 8 }}>页面渲染出错</h1>
        <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
          {import.meta.env.DEV ? String(error?.message ?? error) : "请重试或刷新页面。"}
        </p>
        <button type="button" onClick={retry} style={{ padding: "8px 16px", marginRight: 8, cursor: "pointer" }}>
          重试
        </button>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 16px", cursor: "pointer" }}>
          刷新页面
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary renderFallback={topLevelFallback}>
      {renderForEdition(activeEdition)}
    </ErrorBoundary>
  </StrictMode>,
)
