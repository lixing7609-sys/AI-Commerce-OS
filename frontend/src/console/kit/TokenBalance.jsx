import { Metric } from "./Metric.jsx";

export function TokenBalance({ balance, budget, unit = "Token" }) {
  return (
    <Metric
      variant="standard"
      value={balance.toLocaleString()}
      unit={unit}
      caption={budget ? `预算 ${budget.toLocaleString()} ${unit}` : undefined}
    />
  );
}
