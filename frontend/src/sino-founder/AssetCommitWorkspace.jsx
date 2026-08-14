const TYPE_LABELS = {
  decision: "Decision（决策）", project: "Project（项目）", workflow: "Workflow（工作流）",
  prompt: "Prompt（提示词）", capability: "Capability（能力）", knowledge: "Knowledge（知识）",
  skill: "Skill（技能）", agent: "Agent（智能体）", connector: "Connector（连接器）",
};

export function AssetCommitWorkspace({ commit, onViewAssets, onReturnDiscussion, onNewGoal }) {
  if (!commit?.commit_id) return null;
  const items = commit.items || [];
  return <section className="sino-asset-commit" aria-label="Asset Commit">
    <header><span>Asset Commit</span><h2>资产提交完成</h2><p>{items.length} 项资产已经正式进入 AI Commerce OS。</p></header>
    <div className="sino-asset-commit__items">{items.map((item) => <details key={item.discussion_object_id || item.asset_id}>
      <summary><span>{TYPE_LABELS[item.object_type] || item.object_type}</span><strong>{item.name}</strong><b>✓ Committed</b></summary>
      <dl><div><dt>Asset ID</dt><dd>{item.asset_id}</dd></div><div><dt>最终仓库</dt><dd>{item.destination}</dd></div><div><dt>用途</dt><dd>{item.purpose || "暂无"}</dd></div><div><dt>依赖</dt><dd>{item.dependencies?.length ? item.dependencies.join(" · ") : "暂无"}</dd></div></dl>
    </details>)}</div>
    <p className="sino-asset-commit__complete">全部提交成功。Conversation 已完成。</p>
    <footer><button type="button" className="is-primary" onClick={onViewAssets}>查看资产</button><button type="button" onClick={onReturnDiscussion}>返回讨论</button><button type="button" onClick={onNewGoal}>开始新的目标</button></footer>
  </section>;
}
