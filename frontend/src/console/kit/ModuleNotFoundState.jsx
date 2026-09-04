import { EmptyState } from "./EmptyState.jsx";
import { Button } from "./Button.jsx";

/**
 * URL 上的 module key 不在 navConfig.js 的权威列表里——不是权限
 * 问题（见 PermissionDeniedState），是这个模块本身不存在。
 */
export function ModuleNotFoundState({ moduleKey, onGoToDefault }) {
  return (
    <EmptyState
      icon="?"
      message={
        <>
          <div>未找到模块{moduleKey ? `“${moduleKey}”` : ""}</div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
            这个模块 key 不在当前 Edition 的注册列表里，可能是链接过期或输入有误。
          </div>
        </>
      }
      action={onGoToDefault ? <Button size="sm" variant="secondary" onClick={onGoToDefault}>返回默认模块</Button> : null}
    />
  );
}
