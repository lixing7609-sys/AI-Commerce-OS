import { Icon } from "./Icon.jsx";

export function AICostIndicator({ amount, unit, kind = "predicted" }) {
  return (
    <span className="fdr-ai-cost">
      <Icon name="Coins" size={14} />
      {kind === "actual" ? "实际" : "预估"} <span className="fdr-tabular-num">{amount}</span> {unit}
    </span>
  );
}
