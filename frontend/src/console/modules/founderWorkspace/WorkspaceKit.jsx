import { StatusPill, TextButton } from "../../kit/index.js";
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
