import { useState } from "react";
import { useFounderAI } from "../useFounderAI.js";

const STATUS_FILTERS = ["全部", "执行中", "阻塞", "待验收", "已完成"];

export function ExecutionTracking() {
  const { executionTasks, updateExecutionTask } = useFounderAI();
  const [filter, setFilter] = useState("全部");

  const filtered = filter === "全部" ? executionTasks : executionTasks.filter((t) => t.stage === filter);

  return (
    <div className="founder-ai-view-shell">
      <div className="studio-channel-chips">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`sf-icon-button${f === filter ? " is-active" : ""}`}
            style={f === filter ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
            onClick={() => setFilter(f)}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="founder-ai-stack" style={{ marginTop: 12 }}>
        {filtered.map((t) => (
          <div key={t.id} className="sf-card">
            <div className="founder-ai-row-header">
              <h3>{t.name}</h3>
              <span className={`sf-badge ${t.stage === "阻塞" ? "danger" : t.stage === "待验收" ? "warn" : "success"}`}>
                {t.stage}
              </span>
            </div>
            <dl className="founder-ai-definition-grid">
              <dt>来源</dt>
              <dd>{t.source}</dd>
              <dt>执行者</dt>
              <dd>{t.executor}</dd>
              <dt>已完成内容</dt>
              <dd>{t.doneSummary}</dd>
              <dt>阻塞原因</dt>
              <dd>{t.blockers}</dd>
              <dt>下一步</dt>
              <dd>{t.nextStep}</dd>
              <dt>是否需要再次授权</dt>
              <dd>{t.needsReauthorization ? "是" : "否"}</dd>
            </dl>
            <div className="founder-ai-progress-track">
              <div className="founder-ai-progress-fill" style={{ width: `${t.progress}%` }} />
            </div>
            <p className="founder-ai-meta">进度 {t.progress}%</p>
            {t.stage !== "已完成" && (
              <div className="founder-ai-actions">
                {t.stage !== "执行中" && (
                  <button type="button" className="sf-icon-button" onClick={() => updateExecutionTask(t.id, { stage: "执行中" })}>
                    标记为执行中
                  </button>
                )}
                {t.stage !== "待验收" && (
                  <button type="button" className="sf-icon-button" onClick={() => updateExecutionTask(t.id, { stage: "待验收", progress: 90 })}>
                    标记为待验收
                  </button>
                )}
                <button
                  type="button"
                  className="sf-button-primary"
                  onClick={() => updateExecutionTask(t.id, { stage: "已完成", progress: 100, blockers: "无" })}
                >
                  标记为已完成
                </button>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && <p className="founder-ai-empty">该状态下暂无任务</p>}
      </div>
    </div>
  );
}
