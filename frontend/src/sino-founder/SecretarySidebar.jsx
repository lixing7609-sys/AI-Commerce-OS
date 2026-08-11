export function SecretarySidebar({ digest }) {
  const items = [
    ["today", "今日讨论", digest?.topics?.length || 0],
    ["decisions", "已形成决策", digest?.decisions?.length || 0],
    ["knowledge", "新增知识", digest?.knowledge_items?.length || 0],
    ["candidates", "候选目标", digest?.candidate_goals?.filter((item) => item.status === "candidate").length || 0],
    ["questions", "待确认问题", digest?.pending_questions?.filter((item) => item.status === "open").length || 0],
    ["knowledge-center", "资产与记忆", null],
  ];
  return <aside className="sino-sidebar"><a className="sino-brand" href="/founder/sino"><span>S</span><div>Sino<strong>Founder AI</strong></div></a><div className="sino-sidebar__label">AI 秘书整理</div><nav aria-label="AI 秘书讨论成果">{items.map(([id, label, count], index) => <a key={id} href={`#${id}`} className={index === 0 ? "is-active" : ""}><span>{String(index + 1).padStart(2, "0")}</span>{label}{count !== null && <small>{count}</small>}</a>)}</nav><div className="sino-approval-note"><i /><div><strong>讨论优先</strong><small>确认目标后才进入规划与执行</small></div></div><footer>AI Commerce OS<br /><small>Founder AI Secretary</small></footer></aside>;
}
