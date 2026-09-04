import { Icon } from "./Icon.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { Button } from "./Button.jsx";
import { AIExplanation } from "./AIExplanation.jsx";
import { AIConfidence } from "./AIConfidence.jsx";
import { AIRiskAlert } from "./AIRiskAlert.jsx";
import { AICostIndicator } from "./AICostIndicator.jsx";
import { AIModelBadge } from "./AIModelBadge.jsx";
import { AIActionApproval } from "./AIActionApproval.jsx";

const PRIORITY_TONE = { P0: "danger", P1: "warning", P2: "neutral" };

export function AIDecisionCard({ recommendation, explanation, approval, confidence, risk, cost, modelBadge }) {
  if (import.meta.env.DEV && !recommendation?.reason) {

    console.warn("AIDecisionCard: a recommendation must not render without a `reason`");
  }

  const hasMeta = confidence != null || risk || cost || modelBadge;

  return (
    <div className="fdr-ai-card">
      <div className="fdr-ai-card__header">
        <Icon name="Sparkles" size={18} />
        <span className="fdr-ai-card__title">{recommendation.title}</span>
        <StatusPill tone={PRIORITY_TONE[recommendation.priority] || "neutral"}>
          {recommendation.priority}
        </StatusPill>
      </div>

      <p className="fdr-ai-card__reason">{recommendation.reason}</p>

      {explanation ? (
        <div style={{ marginBottom: "var(--space-8)" }}>
          <AIExplanation reason={explanation.reason} expectedEffect={explanation.expectedEffect} />
        </div>
      ) : null}

      {hasMeta ? (
        <div className="fdr-ai-card__meta-row">
          {confidence != null ? <AIConfidence value={confidence} /> : null}
          {risk ? <AIRiskAlert level={risk.level} concern={risk.concern} /> : null}
          {cost ? <AICostIndicator amount={cost.amount} unit={cost.unit} kind={cost.kind} /> : null}
          {modelBadge ? (
            <AIModelBadge modelName={modelBadge.modelName} version={modelBadge.version} />
          ) : null}
        </div>
      ) : null}

      {recommendation.action ? (
        <div className="fdr-ai-card__actions">
          <Button variant="secondary" size="sm" onClick={recommendation.action.onClick}>
            {recommendation.action.label}
          </Button>
        </div>
      ) : null}

      {approval ? (
        <AIActionApproval
          onApprove={approval.onApprove}
          onReject={approval.onReject}
          onEdit={approval.onEdit}
          approver={approval.approver}
          decided={approval.decided}
        />
      ) : null}
    </div>
  );
}
