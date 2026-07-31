import { AppShell, SinoFUTWidget, InfiniteCanvas, useApiState } from "@sinofut/ui";
import { api } from "@sinofut/domain";
import "./app.css";

const CROSS_APP_LINKS = [
  { label: "Founder", href: "http://localhost:5180" },
  { label: "Operator", href: "http://localhost:5181" },
  { label: "Operator Cloud", href: "http://localhost:5183" },
];

const PIPELINE_ORDER = ["brief", "topic", "script", "storyboard", "asset"];

const SEED_NODES = [
  { id: "n-brief", type: "brief", label: "机会简报：LED 灯带内容增长机会", x: 40, y: 220 },
  { id: "n-topic", type: "topic", label: "选题：夜晚氛围灯改造合集", x: 260, y: 100 },
  { id: "n-script", type: "script", label: "脚本：3 个转折点的开箱+改造", x: 480, y: 220 },
  { id: "n-storyboard", type: "storyboard", label: "分镜：6 个镜头", x: 700, y: 100 },
  { id: "n-asset", type: "asset", label: "成片：15s 短视频", x: 920, y: 220 },
  { id: "n-approval", type: "approval", label: "人工审批节点", x: 1140, y: 100 },
  { id: "n-publish", type: "publish", label: "发布准备：抖音渠道", x: 1360, y: 220 },
];

const SEED_EDGES = [
  { from: "n-brief", to: "n-topic" },
  { from: "n-topic", to: "n-script" },
  { from: "n-script", to: "n-storyboard" },
  { from: "n-storyboard", to: "n-asset" },
  { from: "n-asset", to: "n-approval" },
  { from: "n-approval", to: "n-publish" },
];

export default function App() {
  const { state, refresh } = useApiState();

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
    <AppShell appLabel="Studio · 内容生产网络" crossAppLinks={CROSS_APP_LINKS}>
      <div className="sf-page-header">
        <h1>内容生产网络</h1>
        <p>无限画布是唯一主容器。以下画布示意一条完整生产流程：机会简报 → 选题 → 脚本 → 分镜 → 图片/视频 → 审批 → 发布准备。</p>
      </div>

      <InfiniteCanvas storageKey="sinofut-studio-canvas" initialNodes={SEED_NODES} initialEdges={SEED_EDGES} />

      <h2 className="sf-section-title">内容生产任务（真实状态流转）</h2>

      {!state ? (
        <p>加载中…</p>
      ) : (
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
              const nextStage = stageIndex >= 0 && stageIndex < PIPELINE_ORDER.length - 1
                ? PIPELINE_ORDER[stageIndex + 1]
                : null;
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
                  </div>
                </div>
              );
            })}
            {state.content.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无生产中的内容</p>}
          </div>
        </div>
      )}

      <SinoFUTWidget contextLabel="Studio · 内容生产网络" />
    </AppShell>
  );
}
