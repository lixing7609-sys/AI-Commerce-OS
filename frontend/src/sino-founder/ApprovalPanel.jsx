export function ApprovalPanel({ ready, approved, busy, status, onApprove }) {
  return (
    <section className="sino-panel sino-approval" aria-label="审批面板">
      <div><span className="sino-kicker">审批边界</span><h2>Founder 授权</h2></div>
      <p>{approved ? `执行已获授权，Worker 状态：${status || "queued"}` : "Sino 只负责分析与调度；未经明确授权，不会执行。"}</p>
      <div className="sino-actions">
        <button type="button" className="sino-button sino-button--secondary" disabled={!ready || approved || busy} onClick={onApprove}>{approved ? "已授权" : "批准执行"}</button>
      </div>
    </section>
  );
}
