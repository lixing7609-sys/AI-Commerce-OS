import { useCallback, useEffect, useMemo, useState } from "react";

import {
  createArtifactVersion,
  createIntelligenceReference,
  createMemoryRevision,
  getAssetMemoryCenter,
  getLibraryArtifact,
  getLibraryMemory,
  mergeLibraryMemories,
  updateArtifactStatus,
  updateMemoryStatus,
} from "../services/founderAiApi.js";
import { CapabilityMapPanel } from "./CapabilityMapPanel.jsx";
import { NextStrategicActionsPanel } from "./NextStrategicActionsPanel.jsx";
import { RoadmapPanel } from "./RoadmapPanel.jsx";
import { StrategicOverviewCard } from "./StrategicOverviewCard.jsx";

const labels = { active: "有效", superseded: "已取代", invalid: "已失效", archived: "已归档", outdated: "已过期", merged: "已合并", passed: "已通过", failed: "失败", unknown: "未知" };
const text = (value) => value == null ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2);
const time = (value) => value ? new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)) : "时间未知";
const searchable = (item) => JSON.stringify(item).toLowerCase();
const LOAD_TIMEOUT_MS = 15000;
const TECHNICAL_TYPES = new Set(["execution_result", "technical_evidence", "code_change", "test_result", "commit", "log"]);
const isTechnical = (item) => TECHNICAL_TYPES.has(item.artifact_type || item.memory_type) || /commit|code|execution result|test log/i.test(`${item.title || ""} ${item.task || ""}`);

function loadWithTimeout() {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("资产与记忆历史加载超时，请重试")), LOAD_TIMEOUT_MS);
    getAssetMemoryCenter().then((value) => { window.clearTimeout(timeout); resolve(value); }, (error) => { window.clearTimeout(timeout); reject(error); });
  });
}

function normalizeAssetMemoryResponse(response) {
  if (!response || !Array.isArray(response.artifacts) || !Array.isArray(response.memories) || !Array.isArray(response.executions)) {
    console.error("Asset & Memory API contract mismatch", response);
    throw new Error("资产与记忆 API 返回结构不正确，无法读取历史数据");
  }
  return response;
}

function targetFrom(context = {}) {
  if (context.execution_id) return ["execution", context.execution_id, "当前执行"];
  if (context.task_asset_id) return ["task_asset", context.task_asset_id, "当前任务"];
  if (context.goal_id) return ["goal", context.goal_id, "当前目标"];
  if (context.conversation_id) return ["conversation", context.conversation_id, "当前会话"];
  return null;
}

function strategicAssets(strategy, briefing) {
  if (!strategy) return [];
  const common = { status: strategy.roadmap?.status || "active", version: 1, source: "Sino Strategic Analyzer", updated_at: briefing?.project_state?.updated_at || null };
  return [
    { ...common, strategy_id: "strategic-positioning", strategic_type: "strategic_positioning", title: "战略定位", summary: strategy.current_strategic_position, payload: strategy },
    { ...common, strategy_id: "roadmap", strategic_type: "roadmap", title: "长期路线", summary: strategy.roadmap?.vision, payload: strategy.roadmap },
    { ...common, strategy_id: "capability-map", strategic_type: "capability_map", title: "能力地图", summary: `${strategy.capability_status?.applications?.length || 0} 个 AI Application System`, payload: strategy.capability_status },
    { ...common, strategy_id: "strategic-decisions", strategic_type: "strategic_decision", title: "战略决策", summary: strategy.recommendations?.[0]?.title || briefing?.recommended_decision || "暂无战略决策", payload: strategy.recommendations || [] },
    { ...common, strategy_id: "current-phase", strategic_type: "current_phase", title: "当前阶段", summary: strategy.current_phase, payload: { current_phase: strategy.current_phase, current_focus: strategy.recommendations?.[0], recent_decision: briefing?.recommended_decision } },
  ];
}

export function AssetMemoryCenter({ refreshKey, context, strategy, briefing, initialTab = "artifacts", externalDetail = false, onDetailChange }) {
  const [data, setData] = useState({ artifacts: [], memories: [], executions: [] });
  const [tab, setTab] = useState(initialTab);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [timeFilter, setTimeFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [selectedMemoryIds, setSelectedMemoryIds] = useState([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const next = normalizeAssetMemoryResponse(await loadWithTimeout()); setData({ artifacts: next.artifacts, memories: next.memories, executions: next.executions }); setError(""); }
    catch (requestError) { setError(requestError.message || "资产与记忆历史加载失败"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load, refreshKey]);
  useEffect(() => { changeTab(initialTab); }, [initialTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const strategies = useMemo(() => strategicAssets(strategy, briefing), [strategy, briefing]);
  const operatingAssets = useMemo(() => data.artifacts.filter((item) => !isTechnical(item)), [data.artifacts]);
  const longTermMemories = useMemo(() => data.memories.filter((item) => !isTechnical(item)), [data.memories]);
  const technicalEvidence = useMemo(() => [...data.artifacts.filter(isTechnical).map((item) => ({ ...item, _kind: "artifact" })), ...data.memories.filter(isTechnical).map((item) => ({ ...item, _kind: "memory" }))], [data.artifacts, data.memories]);
  const current = tab === "artifacts" ? operatingAssets : tab === "memories" ? longTermMemories : tab === "evidence" ? technicalEvidence : strategies;
  const types = useMemo(() => [...new Set(current.map((item) => item.artifact_type || item.memory_type || item.strategic_type).filter(Boolean))].sort(), [current]);
  const sources = useMemo(() => [...new Set(current.map((item) => item.source || (item.execution_id ? "execution" : item.conversation_id ? "conversation" : "unlinked")))], [current]);
  const filtered = useMemo(() => current.filter((item) => {
    const itemType = item.artifact_type || item.memory_type || item.strategic_type || "legacy";
    const itemStatus = item.status || "active";
    const itemSource = item.source || (item.execution_id ? "execution" : item.conversation_id ? "conversation" : "unlinked");
    const age = item.created_at ? Date.now() - new Date(item.created_at).getTime() : Infinity;
    return (!typeFilter || itemType === typeFilter) && (!statusFilter || itemStatus === statusFilter) && (!sourceFilter || itemSource === sourceFilter) && (!timeFilter || age <= Number(timeFilter) * 86400000) && (!query.trim() || searchable(item).includes(query.trim().toLowerCase()));
  }), [current, query, sourceFilter, statusFilter, timeFilter, typeFilter]);

  async function openDetail(item, kind) {
    if (kind === "strategy") { setSelected({ ...item, kind }); setNotice(""); setError(""); return; }
    setBusy(true); setNotice(""); setError("");
    try { setSelected({ ...(kind === "artifact" ? await getLibraryArtifact(item.artifact_id) : await getLibraryMemory(item.memory_id)), kind }); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function run(operation, success) {
    setBusy(true); setNotice("");
    try { const next = await operation(); setSelected((currentDetail) => next?.artifact_id || next?.memory_id ? { ...next, kind: currentDetail?.kind } : currentDetail); setNotice(success); await load(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(false); }
  }

  async function referenceSelected() {
    const target = targetFrom(context);
    if (!target) return;
    const sourceId = selected.artifact_id || selected.memory_id;
    await run(() => createIntelligenceReference({ source_type: selected.kind, source_id: sourceId, target_type: target[0], target_id: target[1], note: reason || null }), `已引用到${target[2]}`);
  }

  async function mergeSelected() {
    if (selectedMemoryIds.length < 2 || !reason.trim()) return;
    await run(() => mergeLibraryMemories({ memory_ids: selectedMemoryIds, title: "合并记忆", revision_reason: reason }), "已生成合并记忆");
    setSelectedMemoryIds([]);
  }

  function changeTab(nextTab) {
    setTab(nextTab);
    setTypeFilter("");
    setSelected(null);
    setReason("");
    setNotice("");
  }

  const target = targetFrom(context);
  const detailProps = { selected, section: tab, target, reason, setReason, notice, busy, referenceSelected, run, strategy, briefing };
  useEffect(() => {
    if (!externalDetail || !onDetailChange) return undefined;
    onDetailChange(detailProps);
    return () => onDetailChange(null);
  }, [externalDetail, selected, target?.[0], target?.[1], reason, notice, busy, strategy, briefing]); // eslint-disable-line react-hooks/exhaustive-deps

  const listPane = <div className="sino-library-list-pane" aria-label="资产与记忆列表">
        <div className="sino-asset-search"><label htmlFor="asset-memory-search">资产与记忆搜索</label><input id="asset-memory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 task、execution ID、文件、决策或关键词…" />{query && <button type="button" onClick={() => setQuery("")}>清除</button>}</div>
        <div className="sino-library-toolbar"><div className="sino-asset-tabs" role="tablist"><button role="tab" aria-selected={tab === "strategies"} onClick={() => changeTab("strategies")}>战略资产 <span>{strategies.length}</span></button><button role="tab" aria-selected={tab === "artifacts"} onClick={() => changeTab("artifacts")}>运营资产 <span>{operatingAssets.length}</span></button><button role="tab" aria-selected={tab === "memories"} onClick={() => changeTab("memories")}>长期记忆 <span>{longTermMemories.length}</span></button><button role="tab" aria-selected={tab === "evidence"} onClick={() => changeTab("evidence")}>技术实现 <span>{technicalEvidence.length}</span></button></div><div className="sino-library-filters"><label>类型<select aria-label="类型" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="">全部</option>{types.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>状态<select aria-label="状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">全部</option>{[...new Set(current.map((item) => item.status || "active"))].map((value) => <option key={value} value={value}>{labels[value] || value}</option>)}</select></label><label>来源<select aria-label="来源" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="">全部</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label>时间<select aria-label="时间" value={timeFilter} onChange={(event) => setTimeFilter(event.target.value)}><option value="">全部</option><option value="1">今天</option><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></label></div></div>
        {tab === "memories" && selectedMemoryIds.length >= 2 && <div className="sino-library-merge"><input aria-label="合并原因" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明合并原因"/><button type="button" disabled={!reason.trim() || busy} onClick={mergeSelected}>合并已选记忆</button></div>}
        {loading && <p className="sino-asset-state">正在读取历史资产…</p>}{!loading && error && <p className="sino-error" role="alert">{error}</p>}
        {!loading && !error && <div className="sino-asset-list">{filtered.map((item) => { const kind = item._kind || (tab === "artifacts" ? "artifact" : tab === "memories" ? "memory" : "strategy"); const id = item.artifact_id || item.memory_id || item.strategy_id; const active = id === (selected?.artifact_id || selected?.memory_id || selected?.strategy_id); const source = item.source || (item.execution_id ? "Execution" : item.conversation_id ? "Conversation" : "未关联"); return <div className={`sino-asset-row${active ? " is-selected" : ""}`} key={`${kind}-${id}`}>{kind === "memory" && tab === "memories" && <input aria-label={`选择 ${item.title}`} type="checkbox" checked={selectedMemoryIds.includes(id)} onChange={() => setSelectedMemoryIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id])}/>}<button type="button" onClick={() => openDetail(item, kind)} aria-pressed={active}><div><strong>{item.title || item.task || item.goal || id}</strong><small>{item.artifact_type || item.memory_type || item.strategic_type || "legacy"} · {labels[item.status || "active"]}</small></div><span className="sino-asset-row__source">{source}</span><time>{time(item.updated_at || item.created_at)}</time><span className="sino-asset-row__menu" aria-hidden="true">···</span></button></div>; })}{!filtered.length && <p className="sino-asset-state">没有匹配的记录。</p>}</div>}
      </div>;
  const detailPane = selected?.kind === "strategy" ? <StrategicAssetDetailPane selected={selected} strategy={strategy} briefing={briefing} /> : <AssetMemoryDetailPane {...detailProps} />;
  return <section className={`sino-section sino-asset-center${externalDetail ? " sino-asset-center--global" : ""}`} id="knowledge" aria-label="可复用智能资产库">
    {externalDetail ? listPane : <div className="sino-library-workspace">{listPane}{detailPane}</div>}
  </section>;
}

export function AssetMemoryDetailPane({ selected, section, target, reason, setReason, notice, busy, referenceSelected, run, strategy, briefing }) {
  if (selected?.kind === "strategy") return <StrategicAssetDetailPane selected={selected} strategy={strategy} briefing={briefing} />;
  return <aside className="sino-asset-detail" aria-label="智能资产详情">
        {!selected && <div className="sino-asset-detail__empty"><p>{section === "evidence" ? "选择一条技术实现查看详情" : "选择一条资产查看详情"}</p></div>}
        {selected && <><header><div><span className="sino-kicker">{section === "evidence" ? "技术实现" : selected.kind === "artifact" ? "成果详情" : "记忆详情"}</span><h3>{selected.title || selected.artifact_id || selected.memory_id}</h3></div></header>
      <dl><div><dt>ID</dt><dd>{selected.artifact_id || selected.memory_id}</dd></div><div><dt>类型</dt><dd>{selected.artifact_type || selected.memory_type}</dd></div><div><dt>状态</dt><dd>{labels[selected.status] || selected.status}</dd></div><div><dt>版本</dt><dd>{selected.kind === "artifact" ? `V${selected.version || 1}` : `R${selected.revision_number || 1}`}</dd></div><div><dt>创建 / 更新</dt><dd>{time(selected.created_at)} / {time(selected.updated_at)}</dd></div><div><dt>来源会话</dt><dd>{selected.conversation_id || "—"}</dd></div><div><dt>来源目标</dt><dd>{selected.goal_id || "—"}</dd></div><div><dt>来源任务</dt><dd>{selected.task_asset_id || "—"}</dd></div><div><dt>来源执行</dt><dd>{selected.execution_id || "—"}</dd></div>{selected.kind === "memory" && <><div><dt>重要性</dt><dd>{selected.importance ?? "—"}</dd></div><div><dt>标签</dt><dd>{selected.tags?.join(", ") || "—"}</dd></div></>}</dl>
      <h4>{selected.kind === "artifact" ? "摘要 / 文件引用" : "完整内容"}</h4><pre className="sino-detail-scroll-region" tabIndex={0}>{text(selected.kind === "artifact" ? { summary: selected.summary, location: selected.location, content_ref: selected.content_ref, memory_references: selected.memory_references } : { summary: selected.summary, content: selected.content })}</pre>
      <label className="sino-library-reason">修订 / 引用说明<input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="说明原因或引用备注" /></label><div className="sino-library-actions"><button type="button" disabled={!target || busy} onClick={referenceSelected}>{selected.kind === "memory" ? "引用此记忆" : `引用到${target?.[2] || "当前上下文"}`}</button><button type="button" onClick={() => setNotice(selected.conversation_id || selected.goal_id || selected.task_asset_id || selected.execution_id ? "来源标识已显示在详情中" : "该记录没有来源标识")}>查看来源</button>{selected.kind === "artifact" ? <><button type="button" disabled={!reason.trim() || busy} onClick={() => run(() => createArtifactVersion(selected.artifact_id, { revision_reason: reason }), "已创建新版本")}>创建新版本</button><button type="button" disabled={busy} onClick={() => run(() => updateArtifactStatus(selected.artifact_id, "invalid"), "已标记失效")}>标记失效</button></> : <><button type="button" disabled={!reason.trim() || busy} onClick={() => run(() => createMemoryRevision(selected.memory_id, { revision_reason: reason }), "已创建修订")}>创建修订</button><button type="button" disabled={busy} onClick={() => run(() => updateMemoryStatus(selected.memory_id, "outdated"), "已标记过期")}>标记过期</button><button type="button" disabled={busy} onClick={() => run(() => updateMemoryStatus(selected.memory_id, "invalid"), "已标记失效")}>标记失效</button></>}</div>{notice && <p role="status">{notice}</p>}
      <h4>{selected.kind === "artifact" ? "版本历史" : "修订历史"}</h4><ol className="sino-library-history">{selected.history?.map((entry) => <li key={entry.artifact_id || entry.memory_id}><strong>{selected.kind === "artifact" ? `V${entry.version}` : `R${entry.revision_number}`}</strong><span>{time(entry.created_at)}</span><span>{labels[entry.status] || entry.status}</span><p>{entry.revision_reason || "原始记录"}</p></li>)}</ol>
      <h4>引用关系</h4>{selected.references?.length ? <ul>{selected.references.map((reference) => <li key={reference.reference_id}>{reference.target_type} · {reference.target_id}</li>)}</ul> : <p>尚未引用到其他上下文。</p>}
        </>}
  </aside>;
}

export function StrategicAssetDetailPane({ selected, strategy, briefing }) {
  if (!selected) return <aside className="sino-asset-detail" aria-label="战略资产详情"><div className="sino-asset-detail__empty"><p>选择一条战略资产查看详情</p></div></aside>;
  return <aside className="sino-asset-detail sino-strategic-detail" aria-label="战略资产详情">
    <header><div><span className="sino-kicker">战略资产详情</span><h3>{selected.title}</h3></div></header>
    <dl><div><dt>ID</dt><dd>{selected.strategy_id}</dd></div><div><dt>类型</dt><dd>{selected.strategic_type}</dd></div><div><dt>状态</dt><dd>{labels[selected.status] || selected.status}</dd></div><div><dt>版本</dt><dd>V{selected.version || 1}</dd></div><div><dt>来源</dt><dd>{selected.source || "—"}</dd></div></dl>
    {selected.strategic_type === "strategic_positioning" && <StrategicOverviewCard strategy={strategy} />}
    {selected.strategic_type === "roadmap" && <RoadmapPanel roadmap={strategy?.roadmap} />}
    {selected.strategic_type === "capability_map" && <CapabilityMapPanel capabilityStatus={strategy?.capability_status} />}
    {selected.strategic_type === "strategic_decision" && <NextStrategicActionsPanel actions={briefing?.recommendations || strategy?.recommendations} />}
    {selected.strategic_type === "current_phase" && <div className="sino-context-summary"><article><span className="sino-kicker">当前阶段</span><strong>{strategy?.current_phase || "—"}</strong><p>当前重点：{strategy?.recommendations?.[0]?.title || "暂无"}</p><p>最近战略决策：{briefing?.recommended_decision || "暂无"}</p></article></div>}
  </aside>;
}
