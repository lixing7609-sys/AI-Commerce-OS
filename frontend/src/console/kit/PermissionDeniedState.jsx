import { EmptyState } from "./EmptyState.jsx";

/**
 * 模块存在，但当前 Edition Policy 不允许访问——区别于
 * ModuleNotFoundState（模块本身不存在）。今天 Founder 的
 * capabilities profile 是全量放行，这个状态主要为未来复用同一套
 * Shell 逻辑的受限 Edition 准备，但逻辑现在就要写对。
 */
export function PermissionDeniedState({ moduleLabel }) {
  return (
    <EmptyState
      icon="⛔"
      message={
        <>
          <div>无权访问{moduleLabel ? `“${moduleLabel}”` : "该模块"}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            当前身份的权限范围不包含这个模块。
          </div>
        </>
      }
    />
  );
}
