import { getRuntimeStateLabel, RUNTIME_STATE_LABELS } from "./runtimeLabels";

function RuntimeStateBadge({ state }) {
  const className = RUNTIME_STATE_LABELS[state] ? state : "unknown";

  return (
    <span className={`runtime-state-badge ${className}`}>
      {getRuntimeStateLabel(state)}
    </span>
  );
}

export default RuntimeStateBadge;
