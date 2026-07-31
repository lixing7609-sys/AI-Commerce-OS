import { useApiState } from "@sinofut/ui";

export function Review() {
  const { state } = useApiState();
  if (!state) return <p>加载中…</p>;

  const reviewing = state.content.filter((c) => c.stage === "approval");

  return (
    <div>
      <div className="sf-page-header">
        <h1>内容审核</h1>
        <p>
          审核只是内容统一生命周期中的一个状态，不是单独的工作流。实际的通过/驳回操作由 Founder 在
          经营驾驶舱的「待审批」执行（Human Approval 是人类最终授权，见系统核心逻辑）。
        </p>
      </div>

      <div className="sf-grid sf-grid-2">
        {reviewing.map((c) => {
          const approval = state.approvals.find((a) => a.contentId === c.id && a.status === "pending");
          return (
            <div key={c.id} className="sf-card">
              <h3>{c.title}</h3>
              <span className="sf-badge warn">待审核</span>
              {approval && <p style={{ marginTop: 8 }}>AI 建议：{approval.aiSuggestion}</p>}
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                前往 Founder · 经营驾驶舱处理审批 → http://localhost:5180/cockpit
              </p>
            </div>
          );
        })}
        {reviewing.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无待审核内容</p>}
      </div>
    </div>
  );
}
