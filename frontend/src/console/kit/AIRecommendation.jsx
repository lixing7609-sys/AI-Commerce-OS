import { Icon } from "./Icon.jsx";
import { StatusPill } from "./StatusPill.jsx";
import { Button } from "./Button.jsx";

const PRIORITY_TONE = { P0: "danger", P1: "warning", P2: "neutral" };

export function AIRecommendation({ title, reason, priority, action }) {
  if (import.meta.env.DEV && !reason) {

    console.warn("AIRecommendation: a recommendation must not render without a `reason`");
  }

  return (
    <div className="fdr-ai-card">
      <div className="fdr-ai-card__header">
        <Icon name="Sparkles" size={18} />
        <span className="fdr-ai-card__title">{title}</span>
        <StatusPill tone={PRIORITY_TONE[priority] || "neutral"}>{priority}</StatusPill>
      </div>
      <p className="fdr-ai-card__reason">{reason}</p>
      {action ? (
        <div className="fdr-ai-card__actions">
          <Button variant="secondary" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
