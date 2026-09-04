import { useApiState } from "@sinofut/ui";

export function Publish() {
  const { state } = useApiState();
  if (!state) return <p>加载中…</p>;

  const readyToPublish = state.content.filter((c) => c.stage === "ready");
  const published = state.content.filter((c) => c.stage === "published");

  return (
    <div>
      <div className="sf-page-header">
        <h1>内容发布</h1>
        <p>已审核通过、等待发布的内容在此追踪；实际发布执行动作由 Operator 在经营中心完成。</p>
      </div>

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>待发布（已审核）</h3>
          {readyToPublish.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.title}</h4>
              <span className="sf-badge success">已审核</span>
            </div>
          ))}
          {readyToPublish.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无待发布内容</p>}
          <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
            前往 Operator · 经营中心执行发布 → http://localhost:5181
          </p>
        </div>

        <div className="sf-card">
          <h3>已发布</h3>
          {published.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.title}</h4>
              <span className="sf-badge">已发布</span>
            </div>
          ))}
          {published.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无已发布内容</p>}
        </div>
      </div>
    </div>
  );
}
