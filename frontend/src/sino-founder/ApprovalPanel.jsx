export function ApprovalPanel({ ready, approved, busy, status, latestDelta, onApprove }) {
  const pendingDelta = latestDelta?.status === "pending_confirmation";
  const failed = status === "failed";
  return (
    <section className="sino-founder-actions" aria-label="待 Founder 处理">
      <div><span className="sino-kicker">待 Founder 处理</span><h3>{failed ? "执行异常" : pendingDelta ? "范围变化待确认" : approved ? "当前无需处理" : "等待批准"}</h3></div>
      <p>{failed ? "请检查执行异常后决定是否恢复。" : pendingDelta ? "Sino 已生成影响分析和调整方案，请确认后继续。" : approved ? "当前执行可按已确认范围继续。" : "批准后执行引擎才会开始工程操作。"}</p>
      <div className="sino-actions">
        <button type="button" className="sino-button sino-button--secondary" disabled={!ready || approved || busy} onClick={onApprove}>{approved ? "已授权" : "批准执行"}</button>
      </div>
    </section>
  );
}
