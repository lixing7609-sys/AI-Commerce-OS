import { StatusPill, TextButton, Button, Tooltip, ModuleSkeleton } from "../../kit/index.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { STATUS_LABEL, STATUS_TONE } from "./workspaceEntities.js";

/** Shared status pill using the one Decision/Risk/Validation/Notification vocabulary. */
export function WorkspaceStatusBadge({ status }) {
  return <StatusPill tone={STATUS_TONE[status] ?? "neutral"}>{STATUS_LABEL[status] ?? status}</StatusPill>;
}

/** Drill-down back into the module that produced this row's data. */
export function DrillDownLink({ module, subView, children }) {
  const { navigate } = useConsoleNavContext();
  return (
    <TextButton onClick={() => navigate(module, subView ? { subView } : undefined)}>
      {children} →
    </TextButton>
  );
}

export function WorkspaceLoadingSkeleton({ title, subtitle }) {
  return <ModuleSkeleton title={title} subtitle={subtitle} plannedFeatures={["正在加载演示数据…"]} />;
}

/**
 * 每个模块都要求有一个「无权限/功能受限」状态（框架审查标准 #14）。
 * 当前 Founder 身份是全量放行，所以这里始终按钮 disabled，用
 * Tooltip 说明原因即可，不用做真正的权限判断。
 */
export function RestrictedAction({ label, reason = "演示环境未开放该操作", variant = "secondary" }) {
  return (
    <Tooltip content={reason}>
      <Button variant={variant} disabled aria-disabled="true">
        {label}
      </Button>
    </Tooltip>
  );
}
