const STEPS = ["Approved", "Queued", "Executing", "Testing", "Completed"];

export function ExecutionTimeline({ status }) {
  const stage = { approved: 0, queued: 1, executing: 2, testing: 3, completed: 4, failed: 2 }[status] ?? -1;
  return (
    <section className="sino-timeline" aria-label="Execution Timeline">
      <span className="sino-kicker">Execution timeline</span>
      <ol>{STEPS.map((step, index) => <li key={step} className={index <= stage ? "is-active" : ""}><span>{index + 1}</span>{step}</li>)}</ol>
      {status === "failed" && <p className="sino-error">Execution failed. Review the captured error before retrying.</p>}
    </section>
  );
}
