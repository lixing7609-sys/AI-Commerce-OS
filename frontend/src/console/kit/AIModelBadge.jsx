import { Icon } from "./Icon.jsx";

export function AIModelBadge({ modelName, version }) {
  return (
    <span className="fdr-ai-model-badge">
      <Icon name="Cpu" size={14} />
      {modelName}{version ? ` v${version}` : ""}
    </span>
  );
}
