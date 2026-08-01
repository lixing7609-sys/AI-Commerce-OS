import { useState } from "react";
import { NavIcon } from "./icons.jsx";
import { getNextActions } from "./sinoAnalysisService.js";

// 共识/待确认/已否决/关键约束 共用的可展开列表 —— 四处复用同一个实现，
// 对应建议组件拆分里的 ConsensusList / PendingConfirmationList /
// RejectedDecisionList / ConstraintList（职责一致，没有必要写四份重复代码）。
function SinoStateSection({ icon, label, items, tone }) {
  const [expanded, setExpanded] = useState(true);
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
          {items.length === 0 && <li className="sino-panel-empty">暂无</li>}
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

  const actions = getNextActions(conversation);

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

      <div className="sino-panel-scroll">
        <SinoStateSection icon="check" label="已形成共识" items={conversation.consensus} tone="success" />
        <SinoStateSection icon="question" label="待确认" items={conversation.pendingConfirmations} tone="warn" />
        <SinoStateSection icon="reject" label="已否决" items={conversation.rejected} tone="danger" />
        <SinoStateSection icon="lock" label="关键约束" items={conversation.constraints} tone="neutral" />
      </div>

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
