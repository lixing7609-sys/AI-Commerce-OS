import { useApiState } from "@sinofut/ui";
import { api } from "@sinofut/domain";

const PIPELINE_ORDER = ["brief", "topic", "script", "storyboard", "asset"];

export function Production() {
  const { state, refresh } = useApiState();

  if (!state) return <p>加载中…</p>;

  const createContent = async (strategyId) => {
    await api.createContent(strategyId);
    refresh();
  };

  const advance = async (contentId, stage) => {
    await api.advanceContent(contentId, stage);
    refresh();
  };

  const submitApproval = async (contentId) => {
    await api.submitForApproval(contentId);
    refresh();
  };

  return (
    <div>
      <div className="sf-page-header">
        <h1>内容生产中心</h1>
        <p>从策略创建内容生产任务，推进生产流水线，提交人工审批——这里是内容真实状态流转的枢纽。</p>
      </div>

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>由 SinoFUT 创建内容生产任务</h3>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            选择一个已生成策略的机会，创建对应的内容生产任务。
          </p>
          {state.strategies.map((s) => {
            const hasContent = state.content.some((c) => c.strategyId === s.id);
            return (
              <div key={s.id} className="sf-opportunity-item">
                <h4>{s.hypothesis}</h4>
                <button
                  type="button"
                  className="sf-button-primary"
                  disabled={hasContent}
                  onClick={() => createContent(s.id)}
                >
                  {hasContent ? "已创建内容任务" : "创建内容任务"}
                </button>
              </div>
            );
          })}
          {state.strategies.length === 0 && (
            <p style={{ color: "var(--text-tertiary)" }}>暂无策略，请先在 Founder · 增长网络生成策略</p>
          )}
        </div>

        <div className="sf-card">
          <h3>生产中的内容</h3>
          {state.content.map((c) => {
            const stageIndex = PIPELINE_ORDER.indexOf(c.stage);
            const nextStage =
              stageIndex >= 0 && stageIndex < PIPELINE_ORDER.length - 1 ? PIPELINE_ORDER[stageIndex + 1] : null;
            return (
              <div key={c.id} className="sf-opportunity-item">
                <h4>{c.title}</h4>
                <span className="sf-badge">{c.stage}</span>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {nextStage && (
                    <button type="button" className="sf-icon-button" onClick={() => advance(c.id, nextStage)}>
                      推进到「{nextStage}」
                    </button>
                  )}
                  {c.stage === "asset" && (
                    <button type="button" className="sf-button-primary" onClick={() => submitApproval(c.id)}>
                      提交审批
                    </button>
                  )}
                  {c.stage === "ready" && <span className="sf-badge success">已通过审批，等待 Operator 发布</span>}
                  {c.stage === "published" && <span className="sf-badge success">已发布</span>}
                  {c.stage === "archived" && <span className="sf-badge">已归档</span>}
                </div>
              </div>
            );
          })}
          {state.content.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无生产中的内容</p>}
        </div>
      </div>
    </div>
  );
}
