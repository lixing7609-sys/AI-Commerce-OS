import { Icon } from "./Icon.jsx";

const LEVEL_LABEL = { low: "低风险", medium: "中风险", high: "高风险" };

export function AIRiskAlert({ level, concern }) {
  if (import.meta.env.DEV && !concern) {
     
    console.warn("AIRiskAlert: a generic risk with no `concern` text is prohibited");
  }

  return (
    <span className={`fdr-ai-risk fdr-ai-risk--${level}`}>
      <Icon name={level === "low" ? "ShieldCheck" : "ShieldAlert"} size={14} />
      {LEVEL_LABEL[level] || ""} · {concern}
    </span>
  );
}
