import { PageHeader } from "./PageHeader.jsx";
import { EmptyState } from "./EmptyState.jsx";

/**
 * Checkpoint A/B 阶段用于"已可导航但尚未深入建设"的模块占位页——
 * 不是空白/报错页，是有真实布局、真实标题、清楚说明"即将建设"的
 * 骨架页，Checkpoint C 会把这些替换成完整实现。
 */
export function ModuleSkeleton({ title, subtitle, plannedFeatures = [] }) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="fdr-card">
        <EmptyState
          icon="◔"
          message="该模块即将建设，当前为可导航骨架页"
        />
        {plannedFeatures.length > 0 ? (
          <ul style={{ margin: "0 0 0 0", padding: "0 0 0 18px", color: "var(--text-secondary)", fontSize: 13 }}>
            {plannedFeatures.map((feature) => (
              <li key={feature} style={{ marginBottom: 4 }}>{feature}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
