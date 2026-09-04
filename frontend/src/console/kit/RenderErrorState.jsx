import { EmptyState } from "./EmptyState.jsx";
import { Button } from "./Button.jsx";

/**
 * ErrorBoundary 捕获到渲染期异常时的可见回退——只替换出错的这一块
 * 区域，不让整个应用变白屏。开发环境下附带错误信息，生产环境下
 * 不展示技术细节。
 */
export function RenderErrorState({ moduleLabel, error, onRetry, onGoToDefault }) {
  return (
    <EmptyState
      icon="✕"
      message={
        <>
          <div>{moduleLabel ? `“${moduleLabel}” 渲染失败` : "该区域渲染失败"}</div>
          {import.meta.env.DEV && error ? (
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontFamily: "monospace" }}>
              {String(error?.message ?? error)}
            </div>
          ) : null}
        </>
      }
      action={
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {onRetry ? <Button size="sm" variant="secondary" onClick={onRetry}>重试</Button> : null}
          {onGoToDefault ? <Button size="sm" variant="ghost" onClick={onGoToDefault}>返回默认模块</Button> : null}
        </div>
      }
    />
  );
}
