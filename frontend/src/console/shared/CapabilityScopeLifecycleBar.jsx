import { Banner } from "../kit/Banner.jsx";
import { SegmentedControl } from "../kit/SegmentedControl.jsx";
import { CAPABILITY_SCOPE_OPTIONS, CAPABILITY_LIFECYCLE_STAGES } from "../../demoData/capabilityDemoData.js";

/**
 * AI 能力中心（7 页共用）顶部条——版本范围选择器 + 生命周期阶段
 * 指示条 + 演示框架提示。7 个中心（Agent/Prompt/Skill/Workflow/
 * 知识/Connector/能力中心）交办要求这三样都在顶部出现，且不是四份
 * 各自实现的相似代码，所以放在 console/shared/（不是 kit/，避免和
 * 并行任务修改共享组件冲突）统一实现一次。
 *
 * `scope`/`onScopeChange` 由调用方持有状态——各中心据此过滤自己的
 * 列表/目录/标签页，这里只负责展示选择器本身。`activeStage` 可选，
 * 高亮生命周期阶段指示条中的一个阶段（例如 Prompt 中心测试台可以
 * 传"测试"）。
 */
export function CapabilityScopeLifecycleBar({ scope, onScopeChange, activeStage }) {
  return (
    <div className="fdr-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Banner tone="neutral">演示框架｜尚未接入真实业务数据——本页内容供产品负责人逐页审查框架完整性，非真实运行结果。</Banner>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>版本范围</span>
          <SegmentedControl
            options={CAPABILITY_SCOPE_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
            value={scope}
            onChange={onScopeChange}
          />
        </div>

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 600, marginRight: 2 }}>能力生命周期</span>
          {CAPABILITY_LIFECYCLE_STAGES.map((stage, idx) => (
            <span
              key={stage}
              title={`阶段 ${idx + 1}：${stage}`}
              style={{
                fontSize: 11,
                padding: "3px 9px",
                borderRadius: 999,
                background: stage === activeStage ? "var(--primary, #4f46e5)" : "var(--canvas-subtle, #f1f2f6)",
                color: stage === activeStage ? "#fff" : "var(--text-secondary)",
                fontWeight: stage === activeStage ? 700 : 500,
                whiteSpace: "nowrap",
              }}
            >
              {idx + 1}. {stage}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
