const STEPS = ["目标", "分析", "任务草稿", "授权", "执行", "成果"];

export function ExecutionTimeline({ stage = 0 }) {
  return (
    <section className="sino-timeline" aria-label="Execution Timeline">
      <span className="sino-kicker">Execution timeline</span>
      <ol>{STEPS.map((step, index) => <li key={step} className={index <= stage ? "is-active" : ""}><span>{index + 1}</span>{step}</li>)}</ol>
    </section>
  );
}
