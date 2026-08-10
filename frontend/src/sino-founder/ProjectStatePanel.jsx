export function ProjectStatePanel({ state }) {
  return (
    <section className="sino-briefing" aria-label="Project State Panel">
      <span className="sino-kicker">Project state</span><h2>AI Commerce OS 状态</h2>
      <dl className="sino-state-list"><div><dt>当前阶段</dt><dd>{state?.current_phase || "读取中"}</dd></div><div><dt>已完成能力</dt><dd>{state?.completed_capabilities?.length || 0}</dd></div><div><dt>活动任务</dt><dd>{state?.active_tasks?.length || 0}</dd></div><div><dt>阻塞项</dt><dd>{state?.blocked_items?.length || 0}</dd></div></dl>
    </section>
  );
}
