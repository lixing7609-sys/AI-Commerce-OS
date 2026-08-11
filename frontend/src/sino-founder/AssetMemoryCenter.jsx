import { useEffect, useMemo, useState } from "react";

import { getAssetMemoryCenter } from "../services/founderAiApi.js";

function formatTime(value) {
  if (!value) return "时间未知";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function searchable(item) {
  return JSON.stringify(item).toLowerCase();
}

function contentText(value) {
  if (value == null) return "—";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function statusLabel(value) {
  return { active: "有效", passed: "已通过", failed: "失败", unknown: "未知", completed: "已完成", paused: "已暂停" }[value] || value;
}

export function AssetMemoryCenter({ refreshKey }) {
  const [data, setData] = useState({ artifacts: [], memories: [], executions: [] });
  const [tab, setTab] = useState("artifacts");
  const [query, setQuery] = useState("");
  const [memoryType, setMemoryType] = useState("all");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getAssetMemoryCenter()
      .then((next) => { if (active) { setData({ artifacts: next.artifacts || [], memories: next.memories || [], executions: next.executions || [] }); setError(""); } })
      .catch((requestError) => { if (active) setError(requestError.message || "资产与记忆历史加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  const normalizedQuery = query.trim().toLowerCase();
  const artifacts = useMemo(() => data.artifacts.filter((item) => !normalizedQuery || searchable(item).includes(normalizedQuery)), [data.artifacts, normalizedQuery]);
  const memories = useMemo(() => data.memories.filter((item) => (memoryType === "all" || item.memory_type === memoryType) && (!normalizedQuery || searchable(item).includes(normalizedQuery))), [data.memories, memoryType, normalizedQuery]);
  const memoryTypes = useMemo(() => [...new Set(data.memories.map((item) => item.memory_type))].sort(), [data.memories]);
  const selectedExecution = selected?.execution_id ? data.executions.find((item) => item.execution_id === selected.execution_id) : null;
  const selectedMemoryTypes = selectedExecution ? [...new Set(data.memories.filter((item) => item.execution_id === selectedExecution.execution_id).map((item) => item.memory_type))] : [];

  function followExecution(executionId, nextTab) {
    setQuery(executionId || "");
    setTab(nextTab);
    setSelected(null);
  }

  return (
    <section className="sino-section sino-asset-center" id="knowledge" aria-label="资产与记忆中心">
      <header className="sino-section__header"><div><span className="sino-kicker">持久化系统历史</span><h2>资产与记忆中心</h2></div><p>查询执行过什么、产出了什么，以及 Sino 真正记住了什么。</p></header>
      <div className="sino-asset-search">
        <label htmlFor="asset-memory-search">资产与记忆搜索</label>
        <input id="asset-memory-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索 task、execution ID、文件、决策或关键词…" />
        {query && <button type="button" onClick={() => setQuery("")}>清除</button>}
      </div>
      <div className="sino-asset-tabs" role="tablist" aria-label="资产与记忆分类">
        <button role="tab" aria-selected={tab === "artifacts"} onClick={() => setTab("artifacts")}>成果资产 <span>{data.artifacts.length}</span></button>
        <button role="tab" aria-selected={tab === "memories"} onClick={() => setTab("memories")}>长期记忆 <span>{data.memories.length}</span></button>
      </div>
      {loading && <p className="sino-asset-state">正在读取历史资产…</p>}
      {!loading && error && <p className="sino-error" role="alert">{error}</p>}
      {!loading && !error && tab === "artifacts" && (
        <div className="sino-asset-list" role="tabpanel" aria-label="成果资产">
          {artifacts.map((item) => <button type="button" className="sino-asset-row" key={item.artifact_id} onClick={() => setSelected({ ...item, kind: "artifact" })}><span className="sino-asset-row__type">{item.artifact_type}</span><div><strong>{item.task || item.goal}</strong><p>{item.summary}</p><small>{item.artifact_id} · {item.execution_id || "未关联执行"}</small></div><div className="sino-asset-row__meta"><span data-status={item.verification_status}>{statusLabel(item.verification_status)}</span><time>{formatTime(item.created_at)}</time><small>{item.related_files?.length || 0} 个文件</small></div></button>)}
          {!artifacts.length && <p className="sino-asset-state">没有匹配的成果资产。</p>}
        </div>
      )}
      {!loading && !error && tab === "memories" && (
        <div role="tabpanel" aria-label="长期记忆">
          <div className="sino-memory-filter"><label htmlFor="memory-type">记忆类型</label><select id="memory-type" value={memoryType} onChange={(event) => setMemoryType(event.target.value)}><option value="all">全部类型</option>{memoryTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></div>
          <div className="sino-asset-list">{memories.map((item) => <button type="button" className="sino-asset-row" key={item.memory_id} onClick={() => setSelected({ ...item, kind: "memory" })}><span className="sino-asset-row__type">{item.memory_type}</span><div><strong>{item.title}</strong><p>{contentText(item.decision || item.learning || item.summary || item.execution_result).slice(0, 180)}</p><small>{item.memory_id} · {item.execution_id || "未关联执行"}</small></div><div className="sino-asset-row__meta"><span>{statusLabel(item.status)}</span><time>{formatTime(item.created_at)}</time></div></button>)}{!memories.length && <p className="sino-asset-state">没有匹配的记忆。</p>}</div>
        </div>
      )}
      {selected && <div className="sino-asset-detail" role="dialog" aria-modal="true" aria-label="历史资产详情"><header><div><span className="sino-kicker">{selected.kind === "artifact" ? "成果详情" : "记忆详情"}</span><h3>{selected.artifact_id || selected.memory_id}</h3></div><button type="button" onClick={() => setSelected(null)} aria-label="关闭详情">×</button></header><dl><div><dt>执行</dt><dd>{selected.execution_id || "未关联"}</dd></div><div><dt>任务 / 目标</dt><dd>{selected.task || selected.goal || "—"}</dd></div><div><dt>创建时间</dt><dd>{formatTime(selected.created_at)}</dd></div>{selected.commit_hash && <div><dt>提交</dt><dd>{selected.commit_hash}</dd></div>}{selected.verification_status && <div><dt>验证状态</dt><dd>{statusLabel(selected.verification_status)}</dd></div>}</dl>{selected.kind === "artifact" ? <><h4>摘要</h4><p>{selected.summary}</p><h4>相关文件</h4><ul>{selected.related_files?.map((file) => <li key={file}>{file}</li>) || null}</ul></> : <><h4>完整内容</h4><pre>{contentText(selected.content)}</pre></>}{selectedExecution && <div className="sino-execution-chain"><h4>执行关联链</h4><p>任务 → {selectedExecution.artifacts.length} 个成果 → {selectedMemoryTypes.join(" → ") || `${selectedExecution.memories.length} 条记忆`} → {statusLabel(selectedExecution.verification_status)}</p><p>提交：{selectedExecution.commit_hash || "未记录提交"}</p><div>{selected.kind !== "artifact" && <button type="button" onClick={() => followExecution(selected.execution_id, "artifacts")}>查看关联成果</button>}{selected.kind !== "memory" && <button type="button" onClick={() => followExecution(selected.execution_id, "memories")}>查看关联记忆</button>}</div></div>}</div>}
    </section>
  );
}
