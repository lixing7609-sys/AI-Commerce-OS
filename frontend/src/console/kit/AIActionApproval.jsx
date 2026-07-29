import { Button } from "./Button.jsx";
import { StatusPill } from "./StatusPill.jsx";

export function AIActionApproval({ onApprove, onReject, onEdit, approver, decided }) {
  if (decided) {
    return (
      <div className="fdr-ai-card__actions">
        <StatusPill tone={decided === "approved" ? "success" : "neutral"}>
          {decided === "approved" ? "已批准" : "已拒绝"}
        </StatusPill>
        {approver ? (
          <span className="fdr-type-caption" style={{ color: "var(--text-secondary)" }}>
            由 {approver} 决定
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="fdr-ai-card__actions">
      <Button variant="secondary" size="sm" onClick={onReject}>拒绝</Button>
      {onEdit ? (
        <Button variant="ghost" size="sm" onClick={onEdit}>编辑</Button>
      ) : null}
      <Button variant="primary" size="sm" onClick={onApprove}>批准</Button>
    </div>
  );
}
