import { useEffect, useMemo, useState } from "react";
import { createFounderDeveloperOSAdapter, RUN_LABELS } from "./founderDeveloperOSAdapter.js";

function Value({ children }) {
  return <span>{children === "unavailable" || children == null ? "暂不可用" : children}</span>;
}

function Check({ value }) {
  const text = typeof value === "string" ? value : value?.status;
  const passed = text === "passed" || text === "通过";
  return <span className={`sf-badge ${passed ? "success" : text === "failed" ? "danger" : "warn"}`}>{passed ? "通过" : text === "failed" ? "未通过" : "暂不可用"}</span>;
}

export function FounderDeveloperOSDashboard() {
  const adapter = useMemo(() => createFounderDeveloperOSAdapter(), []);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  async function runCommand(name, ...args) {
    if (busy) return;
    setBusy(name);
    setError(null);
    try { setSnapshot(await adapter[name](...args)); }
    catch (nextError) { setError(nextError); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    let timer;
    let active = true;
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const next = await adapter.refresh_state();
        if (active) { setSnapshot(next); setError(null); }
      } catch (nextError) {
        if (active) setError(nextError);
      }
    };
    const start = () => {
      clearInterval(timer);
      refresh();
      if (document.visibilityState === "visible") timer = setInterval(refresh, 1500);
    };
    start();
    document.addEventListener("visibilitychange", start);
    window.addEventListener("founder-developer-os:refresh", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", start);
      window.removeEventListener("founder-developer-os:refresh", refresh);
    };
  }, [adapter]);

  const mission = snapshot?.mission;
  const run = snapshot?.run;
  const artifact = snapshot?.artifact;
  const candidate = snapshot?.candidate;
  const commit = snapshot?.commit_result;
  const planId = snapshot?.command_context?.plan_id;
  const state = run?.state || "planning";

  return (
    <div className="founder-developer-os" aria-label="Founder Developer OS">
      <div className="founder-developer-os__title">
        <div><span className="founder-developer-os__eyebrow">Founder Workspace</span><h1>今日研发任务</h1></div>
        <button type="button" className="sf-icon-button" onClick={() => runCommand("refresh_state")} disabled={!!busy}>刷新状态</button>
      </div>

      {error && (
        <section className="sf-card founder-developer-os__notice" role="alert">
          <div><strong>{error.message || "当前暂时无法连接研发服务"}</strong><p>{error.impact || "已有成果不会受到影响。"}</p><p>{error.suggestion || "请稍后刷新状态。"}</p></div>
          <button type="button" className="sf-icon-button" onClick={() => runCommand("refresh_state")}>重新连接</button>
        </section>
      )}

      <div className="founder-developer-os__grid">
        <section className="sf-card founder-developer-os__card founder-developer-os__recommendation">
          <div className="founder-ai-row-header"><h3>今日建议</h3><span className={`sf-badge ${mission?.risk_level === "high" ? "danger" : mission?.risk_level === "medium" ? "warn" : "success"}`}>风险：<Value>{mission?.risk_level}</Value></span></div>
          <dl className="founder-developer-os__facts">
            <dt>Workspace</dt><dd><Value>{snapshot?.workspace?.name}</Value> · <Value>{snapshot?.workspace?.branch}</Value></dd>
            <dt>当前 Sprint</dt><dd><Value>{snapshot?.sprint?.title}</Value></dd>
            <dt>推荐 Mission</dt><dd className="is-strong"><Value>{mission?.title}</Value></dd>
            <dt>为什么现在做</dt><dd><Value>{mission?.business_reason}</Value></dd>
            <dt>预计结果</dt><dd><Value>{mission?.expected_result}</Value></dd>
            <dt>依赖与阻塞</dt><dd>{mission?.dependencies?.length ? mission.dependencies.join("、") : snapshot?.sprint?.blockers?.length ? snapshot.sprint.blockers.join("、") : "无"}</dd>
            <dt>当前状态</dt><dd>{RUN_LABELS[state] || "暂不可用"}</dd>
            <dt>最后更新</dt><dd><Value>{run?.updated_at || snapshot?.workspace?.last_checked_at}</Value></dd>
          </dl>
          <div className="founder-ai-actions">
            {!mission && <button type="button" className="sf-button-primary" onClick={() => runCommand("request_today_mission")} disabled={!!busy}>{busy === "request_today_mission" ? "正在制定…" : "获取今日建议"}</button>}
            {snapshot?.actions?.approve_execution && <button type="button" className="sf-button-primary" onClick={() => runCommand("approve_execution", planId)} disabled={!!busy}>批准执行</button>}
            <button type="button" className="sf-icon-button" onClick={() => setReportOpen((open) => !open)}>查看详细方案</button>
          </div>
        </section>

        <section className="sf-card founder-developer-os__card">
          <div className="founder-ai-row-header"><h3>当前执行</h3><span className="sf-badge warn">{RUN_LABELS[state] || "暂不可用"}</span></div>
          <p className="founder-developer-os__mission"><Value>{mission?.title}</Value></p>
          <div className="founder-ai-progress-track"><div className="founder-ai-progress-fill" style={{ width: `${run?.progress ?? (state === "completed" ? 100 : 0)}%` }} /></div>
          <p className="founder-ai-meta"><Value>{run?.current_step}</Value></p>
          <p>{snapshot?.actions?.approve_execution || snapshot?.actions?.approve_commit ? "需要 Founder 授权" : "当前无需 Founder 操作"}</p>
          {snapshot?.actions?.cancel_execution && <button type="button" className="sf-icon-button" onClick={() => runCommand("cancel_execution", planId)} disabled={!!busy}>取消执行</button>}
          {run?.failure_summary && <p className="founder-developer-os__danger">{run.failure_summary}</p>}
        </section>

        <section className="sf-card founder-developer-os__card">
          <div className="founder-ai-row-header"><h3>开发成果</h3><span className={`sf-badge ${artifact?.review_result === "passed" ? "success" : "warn"}`}>{artifact?.review_result === "passed" ? "建议提交" : "等待成果"}</span></div>
          <dl className="founder-developer-os__facts">
            <dt>修改内容</dt><dd><Value>{artifact?.diff_summary}</Value></dd>
            <dt>涉及模块</dt><dd>{artifact?.changed_files?.length ? artifact.changed_files.join("、") : "暂不可用"}</dd>
            <dt>测试</dt><dd><Check value={artifact?.tests} /></dd>
            <dt>Lint</dt><dd><Check value={artifact?.lint} /></dd>
            <dt>Build</dt><dd><Check value={artifact?.build} /></dd>
            <dt>回滚方式</dt><dd><Value>{artifact?.rollback_plan}</Value></dd>
          </dl>
          <div className="founder-ai-actions">
            <button type="button" className="sf-icon-button" onClick={() => setReportOpen((open) => !open)}>查看详细报告</button>
            {snapshot?.actions?.request_revision && <button type="button" className="sf-icon-button" onClick={() => runCommand("request_revision", planId)} disabled={!!busy}>要求修改</button>}
          </div>
        </section>

        <section className="sf-card founder-developer-os__card">
          <div className="founder-ai-row-header"><h3>提交授权</h3><span className={`sf-badge ${commit ? "success" : candidate ? "warn" : ""}`}>{commit ? "已提交" : candidate ? "等待授权" : "尚无成果"}</span></div>
          {candidate && <dl className="founder-developer-os__facts">
            <dt>建议提交说明</dt><dd>{candidate.suggested_commit_message}</dd>
            <dt>修改文件</dt><dd>{candidate.files.length} 个</dd>
            <dt>Review</dt><dd><Check value={candidate.review_status} /></dd>
            <dt>Verification</dt><dd><Check value={candidate.verification_status} /></dd>
            <dt>风险</dt><dd>{candidate.risk_level}</dd>
          </dl>}
          {snapshot?.actions?.approve_commit && <div className="founder-ai-actions"><button type="button" className="sf-button-primary" onClick={() => runCommand("approve_commit", planId)} disabled={!!busy}>批准提交</button><button type="button" className="sf-icon-button" onClick={() => runCommand("reject_commit", planId)} disabled={!!busy}>拒绝提交</button></div>}
          {commit && <dl className="founder-developer-os__facts">
            <dt>Commit Hash</dt><dd title={commit.commit_hash}>{commit.commit_hash}</dd>
            <dt>提交说明</dt><dd>{commit.commit_message}</dd><dt>分支</dt><dd>{commit.branch}</dd>
            <dt>提交文件</dt><dd>{commit.committed_files.join("、")}</dd><dt>Workspace</dt><dd>{commit.workspace_clean ? "干净" : "仍有未提交内容"}</dd>
          </dl>}
          {!candidate && !commit && <p className="founder-ai-empty">自动验收通过后，将在这里请求 Founder 提交授权。</p>}
        </section>
      </div>

      {reportOpen && <section className="sf-card founder-developer-os__report"><div className="founder-ai-row-header"><h3>详细报告</h3><button type="button" className="sf-icon-button" onClick={() => setReportOpen(false)}>收起</button></div><pre>{JSON.stringify(adapter.open_detailed_report(snapshot), null, 2)}</pre></section>}
    </div>
  );
}
