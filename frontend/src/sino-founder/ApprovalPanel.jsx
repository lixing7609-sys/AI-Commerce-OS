export function ApprovalPanel({ ready, approved, busy, onApprove, onExecute }) {
  return (
    <section className="sino-panel sino-approval" aria-label="Approval Panel">
      <div><span className="sino-kicker">Approval boundary</span><h2>Founder 授权</h2></div>
      <p>{approved ? "执行已获授权，可以交给 Codex Adapter。" : "Sino 只负责分析与调度；未经明确授权，不会执行。"}</p>
      <div className="sino-actions">
        <button type="button" className="sino-button sino-button--secondary" disabled={!ready || approved || busy} onClick={onApprove}>{approved ? "已授权" : "批准执行"}</button>
        <button type="button" className="sino-button" disabled={!approved || busy} onClick={onExecute}>{busy ? "执行中…" : "开始执行"}</button>
      </div>
    </section>
  );
}
