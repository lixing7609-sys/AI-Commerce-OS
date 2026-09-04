import { useState } from "react";
import { getSinoNextActions } from "@sinofut/ui";
import { NavIcon } from "./icons.jsx";
import { STAGES } from "./conversationStore.js";

// 共识/待确认/已否决/关键约束 共用的可展开列表 —— 四处复用同一个实现，
// 对应建议组件拆分里的 ConsensusList / PendingConfirmationList /
// RejectedDecisionList / ConstraintList（职责一致，没有必要写四份重复代码）。
// 只有真正积累了内容才渲染这个区块——讨论还没有产生对应的结论时，右侧
// 不应该出现一个"暂无"的空区块，这也是状态驱动而非固定模板的一部分。
function SinoStateSection({ icon, label, items, tone }) {
  const [expanded, setExpanded] = useState(true);
  if (items.length === 0) return null;
  return (
    <div className={`sino-panel-section tone-${tone}`}>
      <button type="button" className="sino-panel-section-header" onClick={() => setExpanded((v) => !v)}>
        <NavIcon name={icon} />
        <span>{label}</span>
        <span className="sino-panel-section-count">{items.length}</span>
        <NavIcon name="chevronDown" />
      </button>
      {expanded && (
        <ul className="sino-panel-section-list">
          {items.map((item) => (
            <li key={item.id}>{item.text}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SinoPanel({ conversation, onAction }) {
  if (!conversation) {
    return (
      <aside className="sino-panel">
        <div className="sino-panel-header">
          <h2>Sino</h2>
        </div>
        <p className="sino-panel-empty-state">新建或打开一个对话，Sino 会在这里实时跟踪讨论状态。</p>
      </aside>
    );
  }

  // Idle：一句话都还没说，Sino 不可能提前知道任何内容——不显示共识/待
  // 确认/已否决/关键约束/建议/任何推进按钮，只有一句引导语。
  if (conversation.stage === STAGES.IDLE) {
    return (
      <aside className="sino-panel">
        <div className="sino-panel-header">
          <h2>Sino</h2>
          <span className="sf-badge">尚未开始</span>
        </div>
        <div className="sino-panel-topic">
          <span className="sino-panel-topic-label">当前主题</span>
          <p>等待你开始表达</p>
        </div>
        <p className="sino-panel-empty-state">直接告诉 Sino 你想研究、判断、开发或执行什么就好。</p>
      </aside>
    );
  }

  const actions = getSinoNextActions({
    stage: conversation.stage,
    consensusCount: conversation.consensus.length,
    pendingCount: conversation.pendingConfirmations.length,
    rejectedCount: conversation.rejected.length,
    constraintCount: conversation.constraints.length,
    hasRetrospective: conversation.messages.some((m) => m.type === "retrospective"),
  });

  const hasAnyState =
    conversation.consensus.length > 0 ||
    conversation.pendingConfirmations.length > 0 ||
    conversation.rejected.length > 0 ||
    conversation.constraints.length > 0;

  return (
    <aside className="sino-panel">
      <div className="sino-panel-header">
        <h2>Sino</h2>
        <span className="sf-badge">{conversation.stage}</span>
      </div>

      <div className="sino-panel-topic">
        <span className="sino-panel-topic-label">当前主题</span>
        <p>{conversation.topic || "尚未确定"}</p>
      </div>

      {hasAnyState && (
        <div className="sino-panel-scroll">
          <SinoStateSection icon="check" label="已形成共识" items={conversation.consensus} tone="success" />
          <SinoStateSection icon="question" label="待确认" items={conversation.pendingConfirmations} tone="warn" />
          <SinoStateSection icon="reject" label="已否决" items={conversation.rejected} tone="danger" />
          <SinoStateSection icon="lock" label="关键约束" items={conversation.constraints} tone="neutral" />
        </div>
      )}

      {conversation.suggestion && (
        <div className="sino-panel-suggestion">
          <NavIcon name="bulb" />
          <p>{conversation.suggestion.text}</p>
        </div>
      )}

      {actions.length > 0 && (
        <div className="sino-panel-actions">
          <span className="sino-panel-actions-label">下一步操作</span>
          <div className="sino-panel-actions-buttons">
            {actions.map((a) => (
              <button key={a.key} type="button" className="sf-button-primary" onClick={() => onAction(a.key)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
