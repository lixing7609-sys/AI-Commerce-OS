import { AIActionApproval } from "./AIActionApproval.jsx";
import { EmptyState } from "./EmptyState.jsx";

export function ApprovalQueue({ items = [], onApprove, onReject, onEdit }) {
  if (items.length === 0) {
    return <EmptyState message="暂无待审批事项" />;
  }

  return (
    <div className="fdr-approval-queue">
      {items.map((item) => (
        <div className="fdr-ai-card" key={item.id}>
          <div className="fdr-ai-card__header">
            <span className="fdr-ai-card__title">{item.title}</span>
          </div>
          <p className="fdr-ai-card__reason">{item.reason}</p>
          <AIActionApproval
            onApprove={() => onApprove?.(item.id)}
            onReject={() => onReject?.(item.id)}
            onEdit={onEdit ? () => onEdit(item.id) : undefined}
            approver={item.approver}
          />
        </div>
      ))}
    </div>
  );
}
