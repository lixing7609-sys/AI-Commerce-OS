import { useState } from "react";

export function ExternalModelProbeDecisionCard({ gate, busy, onDecision }) {
  const requested = gate?.requested_scope || {};
  const [editing, setEditing] = useState(false);
  const [boundary, setBoundary] = useState({
    provider_scope: requested.provider_scope || [],
    model_scope: requested.model_scope || [],
    max_candidates: requested.max_candidates || 1,
    max_probe_count: requested.max_probe_count || 1,
    cost_ceiling: requested.cost_ceiling || "minimal_single_probe_cost_only",
    credential_boundary: requested.credential_boundary || "existing_credential_references_only",
  });
  if (!gate || gate.gate_type !== "EXTERNAL_MODEL_PROBE") return null;
  const pending = ["pending", "boundary_modified"].includes(gate.decision);
  return <article className="sino-image-probe-decision" aria-label="Founder Decision · External Model Probe">
    <header><div><span>Founder Decision</span><h2>External Model Probe Authorization</h2></div><strong>{pending ? "Awaiting Founder" : gate.decision}</strong></header>
    <p>本地配置检查已经完成。确认真实连接状态需要向外部 Provider 发起最小 Probe，可能产生少量 Token/API 成本并使用当前已配置 Credential；未授权前不会发起调用。</p>
    <dl>
      <div><dt>Scope</dt><dd>{(boundary.provider_scope || []).join("、") || "No provider"} · 最多 {boundary.max_probe_count} 次</dd></div>
      <div><dt>Credential</dt><dd>Existing credential references only</dd></div>
      <div><dt>Cost</dt><dd>Minimal probe cost only</dd></div>
      <div><dt>External Effect</dt><dd>Provider inference request only</dd></div>
      <div><dt>Production</dt><dd>None</dd></div>
      <div><dt>Cloud / NAS</dt><dd>None</dd></div>
    </dl>
    <section><strong>禁止</strong><p>新增或修改 Credential、充值、批量 Probe、Production Write、Cloud / NAS，以及批准 Scope 外调用。</p></section>
    {editing ? <fieldset><legend>修改授权边界</legend>
      <label>Provider 范围 <input aria-label="Provider 范围" value={boundary.provider_scope.join(",")} onChange={(event) => setBoundary((value) => ({ ...value, provider_scope: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /></label>
      <label>Model 范围 <input aria-label="Model 范围" value={boundary.model_scope.join(",")} onChange={(event) => setBoundary((value) => ({ ...value, model_scope: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} /></label>
      <label>最大候选数 <input aria-label="最大候选数" type="number" min="1" max="3" value={boundary.max_candidates} onChange={(event) => setBoundary((value) => ({ ...value, max_candidates: Number(event.target.value) }))} /></label>
      <label>最大 Probe 次数 <input aria-label="最大 Probe 次数" type="number" min="1" max={boundary.max_candidates} value={boundary.max_probe_count} onChange={(event) => setBoundary((value) => ({ ...value, max_probe_count: Number(event.target.value) }))} /></label>
      <label>Cost ceiling <input aria-label="Cost ceiling" value={boundary.cost_ceiling} onChange={(event) => setBoundary((value) => ({ ...value, cost_ceiling: event.target.value }))} /></label>
    </fieldset> : null}
    {pending ? <footer>
      <button type="button" className="is-primary" disabled={busy || !boundary.provider_scope.length} onClick={() => onDecision?.("approve", boundary)}>批准有限 Probe</button>
      <button type="button" disabled={busy} onClick={() => editing ? onDecision?.("modify", boundary) : setEditing(true)}>{editing ? "保存授权边界" : "修改授权边界"}</button>
      <button type="button" className="is-danger" disabled={busy} onClick={() => onDecision?.("reject", boundary)}>驳回</button>
    </footer> : null}
  </article>;
}
