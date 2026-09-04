import { objectTypeLabel, statusLabel } from "./founderTerminology.js";

const STEPS = [
  ["idea", "Idea"], ["discussion", "Discussion"], ["candidate", "Candidate"],
  ["developing", "Developing"], ["testing", "Testing"], ["approval", "Ready Approval"], ["ready", "Ready"],
];
const ORDER = { candidate: 2, developing: 3, testing: 4, ready: 6, deprecated: 6 };
const ACTION_LABELS = {
  develop: "开发", archive: "归档", complete_development: "完成开发并进入测试",
  run_test: "运行真实测试", retest: "继续测试", approve_ready: "批准为可引用能力",
  return_to_development: "退回开发", reuse: "引用", deprecate: "弃用", upgrade: "升级",
};

function LifecycleTimeline({ asset }) {
  const test = asset?.test_run_refs?.at?.(-1);
  const current = asset?.status === "testing" && test?.status === "passed" ? 5 : (ORDER[asset?.status] ?? 1);
  return <ol className="sino-capability-timeline" aria-label="能力周期">{STEPS.map(([key, label], index) => <li key={key} className={index < current ? "is-complete" : index === current ? "is-current" : ""}><span>{index < current ? "✓" : index + 1}</span><b>{label}</b></li>)}</ol>;
}

function TestResult({ test }) {
  if (!test) return null;
  return <section className="sino-capability-test-result" aria-label="能力测试结果"><header><span>Test Run</span><strong>{test.status === "passed" ? "✓ 测试通过" : test.status === "failed" ? "测试失败" : "测试中"}</strong></header><dl>
    <div><dt>Test Run ID</dt><dd>{test.test_run_id || test.run_id || "—"}</dd></div>
    <div><dt>Input</dt><dd>{typeof test.input === "string" ? test.input : JSON.stringify(test.input || {})}</dd></div>
    <div><dt>Expected</dt><dd>{typeof test.expected === "string" ? test.expected : JSON.stringify(test.expected || {})}</dd></div>
    <div><dt>Actual</dt><dd>{typeof test.actual === "string" ? test.actual : JSON.stringify(test.actual || {})}</dd></div>
    <div><dt>Evidence</dt><dd>{Array.isArray(test.evidence) ? test.evidence.join(" · ") : test.evidence || "—"}</dd></div>
    {test.failure_reason ? <div><dt>失败原因</dt><dd>{test.failure_reason}</dd></div> : null}
  </dl></section>;
}

export function CapabilityLifecycleCard({ asset, action, candidates = [], error, busy, onAction, onContinue, onOpenRepository }) {
  if (!asset && !candidates.length) return null;
  const actions = asset?.available_actions || [];
  const development = asset?.development_run_refs?.at?.(-1);
  const test = asset?.test_run_refs?.at?.(-1);
  return <section className="sino-capability-lifecycle-card" aria-label="能力周期">
    {asset ? <>
      <header><div><span>Current Capability</span><h2>{asset.name}</h2><p>{objectTypeLabel(asset.asset_type)} · {asset.domain_id || "通用"}</p></div><strong>{statusLabel(asset.status)} · V{asset.version || 1}</strong></header>
      <LifecycleTimeline asset={asset} />
      <dl className="sino-capability-lifecycle-card__identity"><div><dt>Target Asset</dt><dd>{action?.target_asset_id || asset.asset_id}</dd></div><div><dt>当前状态</dt><dd>{statusLabel(asset.status)}</dd></div><div><dt>Next Action</dt><dd>{action?.description || actions.map((item) => ACTION_LABELS[item] || item).join(" · ") || "继续与 Sino 讨论"}</dd></div></dl>
      {development ? <section className="sino-capability-run"><span>Development Run</span><strong>{development.development_run_id || development.run_id}</strong><p>{development.status || "开发中"}{development.task_asset_id ? ` · Task ${development.task_asset_id}` : ""}</p></section> : null}
      <TestResult test={test} />
      {error ? <p className="sino-capability-lifecycle-card__error" role="alert">{error}</p> : null}
      <footer>{actions.filter((item) => ACTION_LABELS[item]).map((item) => <button key={item} type="button" className={["develop", "approve_ready", "reuse"].includes(item) ? "is-primary" : ""} disabled={busy} onClick={() => onAction?.({ action_id: item, target_asset_id: asset.asset_id, target_asset_type: asset.asset_type, target_asset_name: asset.name })}>{ACTION_LABELS[item]}</button>)}<button type="button" disabled={busy} onClick={() => onContinue?.(asset)}>继续讨论</button><button type="button" onClick={onOpenRepository}>查看能力仓库</button></footer>
    </> : <><header><div><span>Candidate Capability Package</span><h2>本轮已沉淀候选能力</h2><p>候选能力独立保存，尚未开发，也不可生产引用。</p></div></header><div className="sino-capability-candidates">{candidates.map((item) => <article key={item.asset_id || item.discussion_object_id}><div><strong>{item.name}</strong><span>{objectTypeLabel(item.object_type || item.asset_type)} · 候选</span></div>{item.asset_id ? <button type="button" disabled={busy} onClick={() => onAction?.({ action_id: "develop", target_asset_id: item.asset_id, target_asset_type: item.object_type || item.asset_type, target_asset_name: item.name })}>开发</button> : null}</article>)}</div></>}
  </section>;
}
