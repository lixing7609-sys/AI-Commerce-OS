import { useState } from "react";

const DEFAULT_BOUNDARY = {
  allow_probe: true,
  max_probe_candidate_count: 3,
  allow_minimal_external_inference_cost: true,
};

export function ImageModelProbeDecisionCard({ loop, busy, onDecision }) {
  const [editing, setEditing] = useState(false);
  const [boundary, setBoundary] = useState(DEFAULT_BOUNDARY);
  const decision = loop?.founder_probe_decision;
  if (!loop || !["founder_gate_required", "founder_gate_rejected", "model_probe_authorized", "model_probe_queued"].includes(loop.status)) return null;
  const pending = loop.status === "founder_gate_required";
  return <article className="sino-image-probe-decision" aria-label="Founder Decision · Bounded Image Model Probe">
    <header><div><span>Founder Decision</span><h2>Bounded Image Model Probe</h2></div><strong>{decision?.approval_status || "Awaiting Founder"}</strong></header>
    <dl>
      <div><dt>Scope</dt><dd>Current configured image-generation candidates only</dd></div>
      <div><dt>Credential</dt><dd>Existing credential references only</dd></div>
      <div><dt>Cost</dt><dd>Minimal probe cost only</dd></div>
      <div><dt>External Effect</dt><dd>Provider inference calls only</dd></div>
      <div><dt>Production</dt><dd>None</dd></div>
      <div><dt>Cloud / NAS</dt><dd>None</dd></div>
    </dl>
    <section><strong>允许</strong><p>最小安全 prompt；最多 {boundary.max_probe_candidate_count} 个当前候选；保存 capability evidence；仅真实 PASS 后登记 supports_image_generation。</p></section>
    <section><strong>禁止</strong><p>新 Provider / Credential、充值或套餐、Cloud / NAS、Production Write、批量生成及 Scope 外调用。</p></section>
    {editing ? <fieldset><legend>修改授权边界</legend><label><input type="checkbox" checked={boundary.allow_probe} onChange={(event) => setBoundary((value) => ({ ...value, allow_probe: event.target.checked }))} /> 允许 Probe</label><label>最大候选数 <input aria-label="最大 Probe 候选数" type="number" min="1" max="5" value={boundary.max_probe_candidate_count} onChange={(event) => setBoundary((value) => ({ ...value, max_probe_candidate_count: Number(event.target.value) }))} /></label><label><input type="checkbox" checked={boundary.allow_minimal_external_inference_cost} onChange={(event) => setBoundary((value) => ({ ...value, allow_minimal_external_inference_cost: event.target.checked }))} /> 允许极小外部推理成本</label></fieldset> : null}
    {pending ? <footer>
      <button type="button" className="is-primary" disabled={busy || !boundary.allow_probe || !boundary.allow_minimal_external_inference_cost} onClick={() => onDecision?.("approve", boundary)}>批准有限 Probe</button>
      <button type="button" disabled={busy} onClick={() => editing ? onDecision?.("modify", boundary) : setEditing(true)}>{editing ? "保存授权边界" : "修改授权边界"}</button>
      <button type="button" className="is-danger" disabled={busy} onClick={() => onDecision?.("reject", boundary)}>驳回</button>
    </footer> : null}
  </article>;
}
