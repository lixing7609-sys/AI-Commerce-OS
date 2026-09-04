import { Icon } from "./Icon.jsx";
import { StatusPill } from "./StatusPill.jsx";

export function AIExecutionStatus({ steps, currentStep, state }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-8)" }}>
      {steps.map((step, index) => {
        const isDone = state === "done" || index < currentStep;
        const isCurrent = index === currentStep;
        const isFailed = isCurrent && state === "failed";
        const isRunning = isCurrent && state === "running";

        return (
          <div key={step} style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
            {isDone ? (
              <Icon name="CheckCircle2" size={16} style={{ color: "var(--success)" }} />
            ) : isFailed ? (
              <Icon name="XCircle" size={16} style={{ color: "var(--danger)" }} />
            ) : isRunning ? (
              <StatusPill tone="info">进行中</StatusPill>
            ) : (
              <Icon name="Circle" size={16} style={{ color: "var(--text-tertiary)" }} />
            )}
            <span style={isDone || isRunning || isFailed ? undefined : { color: "var(--text-tertiary)" }}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
