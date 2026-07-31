import { Link } from "react-router-dom";
import { useApiState, StatCard } from "@sinofut/ui";
import { CONTENT_LIFECYCLE_STAGES, CONTENT_LIFECYCLE_LABEL, contentLifecycle } from "@sinofut/domain";

export function Workbench() {
  const { state } = useApiState();
  if (!state) return <p>加载中…</p>;

  const counts = CONTENT_LIFECYCLE_STAGES.reduce((acc, stage) => ({ ...acc, [stage]: 0 }), {});
  state.content.forEach((c) => {
    counts[contentLifecycle(c.stage)] += 1;
  });

  return (
    <div>
      <div className="sf-page-header">
        <h1>工作台</h1>
        <p>Studio 是一家 AI 内容公司，无限画布只是其中一个工作区。今天的内容生产全貌都在这里。</p>
      </div>

      <div className="sf-grid sf-grid-3" style={{ marginBottom: "var(--space-3)" }}>
        {CONTENT_LIFECYCLE_STAGES.map((stage) => (
          <StatCard key={stage} label={CONTENT_LIFECYCLE_LABEL[stage]} value={counts[stage]} />
        ))}
      </div>

      <div className="sf-grid sf-grid-3" style={{ marginBottom: "var(--space-3)" }}>
        <Link className="sf-card" to="/library" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>内容资产库 →</h3>
          <p>搜索、分类、归档所有已生产内容</p>
        </Link>
        <Link className="sf-card" to="/canvas" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>无限画布 →</h3>
          <p>沉浸式内容生产工作区</p>
        </Link>
        <Link className="sf-card" to="/production" style={{ textDecoration: "none", color: "inherit" }}>
          <h3>内容生产中心 →</h3>
          <p>从策略创建内容生产任务，推进生产流水线</p>
        </Link>
      </div>

      <div className="sf-card">
        <h3>最近内容</h3>
        <ul>
          {state.content.slice(-8).reverse().map((c) => (
            <li key={c.id}>
              {c.title} · {c.contentType || "短视频"} · {CONTENT_LIFECYCLE_LABEL[contentLifecycle(c.stage)]}
            </li>
          ))}
          {state.content.length === 0 && <li>暂无内容，前往「内容生产中心」创建</li>}
        </ul>
      </div>
    </div>
  );
}
