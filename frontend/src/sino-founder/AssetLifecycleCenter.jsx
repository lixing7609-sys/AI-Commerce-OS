import { useEffect, useState } from "react";
import { createExecutionLearning, getLifecycleAsset, getLifecycleAssets, getLifecycleExecutions, getLifecycleLearnings, reuseLifecycleAsset, startLifecycleExecution } from "../services/founderAiApi.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";

const TYPES = [["", "全部"], ["decision", "Decision"], ["project", "Project"], ["workflow", "Workflow"], ["skill", "Skill"], ["prompt", "Prompt"], ["knowledge", "Knowledge"], ["capability", "Capability"], ["connector", "Connector"]];
const executionLabel = (value) => ({ draft: "待授权", approved: "已授权", queued: "等待执行", executing: "执行中", testing: "测试中", completed: "成功", failed: "失败", paused: "已暂停" }[value] || value || "暂无");
const time = (value) => value ? new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value)) : "暂无";

export function AssetLifecycleCenter({ conversationId, projectId, onOpenExecution, onStartNewGoal }) {
  const [type, setType] = useState("");
  const [assets, setAssets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; getLifecycleAssets(type).then((data) => { if (active) setAssets(data.assets || []); }).catch((requestError) => { if (active) setError(requestError.message); }); return () => { active = false; }; }, [type]);
  async function choose(item) { setSelected(item); try { setSelected(await getLifecycleAsset(item.asset_id)); } catch (requestError) { setError(requestError.message); } }
  async function execute() { if (!selected) return; setBusy(true); try { const item = await startLifecycleExecution(selected.asset_id); onOpenExecution?.(item); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  async function reuse(targetType, targetId) { if (!selected || !targetId) return; setBusy(true); try { await reuseLifecycleAsset(selected.asset_id, targetType, targetId, "Founder 从资产中心引用"); setSelected(await getLifecycleAsset(selected.asset_id)); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  return <section className="sino-lifecycle-center" aria-label="资产中心">
    <header><div><span className="sino-kicker">Asset Center</span><h1>正式资产</h1><p>只保存已批准、可长期复用的资产；执行结果保留在执行中心。</p></div><button type="button" onClick={onStartNewGoal}>开始新目标</button></header>
    <nav aria-label="资产类型">{TYPES.map(([key, label]) => <button type="button" key={key || "all"} className={type === key ? "is-active" : ""} onClick={() => setType(key)}>{label}</button>)}</nav>
    {error && <p role="alert">{error}</p>}
    <div className="sino-lifecycle-grid"><div className="sino-asset-list">{assets.length ? assets.map((item) => <button type="button" key={item.asset_id} className={selected?.asset_id === item.asset_id ? "is-active" : ""} onClick={() => choose(item)}><span>{objectTypeLabel(item.asset_type)}</span><strong>{item.name}</strong><small>V{item.version} · {statusLabel(item.status)} · {time(item.updated_at)}</small></button>) : <p>还没有正式资产。批准 Discussion Package 后，资产会在这里出现。</p>}</div>
      <aside className="sino-asset-detail">{selected ? <><span className="sino-kicker">{objectTypeLabel(selected.asset_type)}</span><h2>{selected.name}</h2><p>{selected.purpose || "暂无说明"}</p><dl><div><dt>Asset ID</dt><dd>{selected.asset_id}</dd></div><div><dt>状态 / 版本</dt><dd>{statusLabel(selected.status)} · V{selected.version}</dd></div><div><dt>来源会话</dt><dd>{selected.source_conversation_id || "历史来源不可用"}</dd></div><div><dt>来源成果包</dt><dd>{selected.source_package_id || "暂无"}</dd></div><div><dt>关联 Project</dt><dd>{selected.project_id || "暂无"}</dd></div><div><dt>依赖</dt><dd>{selected.dependency_refs?.length || 0}</dd></div><div><dt>被引用</dt><dd>{selected.reference_count || 0} 次</dd></div><div><dt>Execution</dt><dd>{selected.execution_refs?.length || 0}</dd></div><div><dt>Learning</dt><dd>{selected.learning_refs?.length || 0}</dd></div></dl><div className="sino-lifecycle-actions"><button type="button" onClick={() => reuse("conversation", conversationId)} disabled={!conversationId || busy}>引用到当前目标</button><button type="button" onClick={() => reuse("project", projectId)} disabled={!projectId || busy}>引用到当前项目</button><button type="button" className="is-primary" onClick={execute} disabled={busy}>进入执行</button><button type="button" onClick={onStartNewGoal}>更新资产</button></div></> : <><h2>资产详情</h2><p>选择资产，查看来源、版本、依赖、执行与学习历史。</p></>}</aside></div>
  </section>;
}

export function LifecycleExecutionCenter({ onOpenExecution }) {
  const [items, setItems] = useState([]); const [selected, setSelected] = useState(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; getLifecycleExecutions().then((data) => { if (active) setItems(data.executions || []); }).catch((requestError) => { if (active) setError(requestError.message); }); return () => { active = false; }; }, []);
  async function learn() { setBusy(true); try { await createExecutionLearning(selected.execution_id); const data = await getLifecycleExecutions(); setItems(data.executions || []); } catch (requestError) { setError(requestError.message); } finally { setBusy(false); } }
  return <section className="sino-lifecycle-center" aria-label="执行中心"><header><div><span className="sino-kicker">Execution Center</span><h1>执行</h1><p>这里只保存 Plan、Task、Run、Test、Git、Deployment 与 Result。</p></div></header>{error && <p role="alert">{error}</p>}<div className="sino-lifecycle-grid"><div className="sino-asset-list">{items.length ? items.map((item) => <button type="button" key={item.execution_id} className={selected?.execution_id === item.execution_id ? "is-active" : ""} onClick={() => setSelected(item)}><span>{executionLabel(item.status)}</span><strong>{item.asset_name || item.execution_id}</strong><small>{item.asset_id ? `Asset · ${item.asset_id}` : "Legacy Execution"}</small></button>) : <p>暂无执行。请先从正式资产创建执行。</p>}</div><aside className="sino-asset-detail">{selected ? <><span className="sino-kicker">Execution</span><h2>{selected.asset_name || selected.execution_id}</h2><dl><div><dt>状态</dt><dd>{executionLabel(selected.status)}</dd></div><div><dt>Asset ID</dt><dd>{selected.asset_id || "暂无（Legacy）"}</dd></div><div><dt>Execution ID</dt><dd>{selected.execution_id}</dd></div><div><dt>Task Package</dt><dd>{selected.task_package_id || "暂无"}</dd></div><div><dt>Result</dt><dd>{selected.result ? "已记录" : "暂无"}</dd></div></dl><div className="sino-lifecycle-actions"><button type="button" className="is-primary" onClick={() => onOpenExecution?.(selected)}>查看执行</button><button type="button" disabled={busy || !["completed", "failed"].includes(selected.status)} onClick={learn}>生成 Learning</button></div></> : <><h2>执行详情</h2><p>选择一条执行查看 Founder 需要关注的状态与结果。</p></>}</aside></div></section>;
}

export function LearningWorkspace() {
  const [items, setItems] = useState([]); useEffect(() => { getLifecycleLearnings().then((data) => setItems(data.learnings || [])).catch(() => setItems([])); }, []);
  return <section className="sino-lifecycle-center" aria-label="Learning"><header><div><span className="sino-kicker">Learning</span><h1>执行学习</h1><p>从真实执行结果提炼经验，并决定 No Update、更新资产或创建新资产。</p></div></header><div className="sino-learning-list">{items.length ? items.map((item) => <article key={item.learning_id}><span>{item.outcome}</span><strong>{item.summary}</strong><small>{item.asset_id} · {item.execution_id}</small></article>) : <p>执行完成后，可在执行中心生成 Learning。</p>}</div></section>;
}

export function LifecycleOverview({ onNavigate }) {
  const steps = [["Idea", "Founder 表达想法", "home"], ["Brain", "Goal → Strategy → Validation → Decision", "home"], ["Package", "本轮待审批成果", "home"], ["Asset", "正式、可复用资产", "assets"], ["Execution", "真实执行与结果", "execution"], ["Learning", "从结果提炼经验", "learning"], ["Reuse", "引用到新目标和项目", "assets"]];
  return <section className="sino-lifecycle-center sino-lifecycle-overview"><header><div><span className="sino-kicker">Founder Lifecycle</span><h1>从想法到复用</h1><p>Conversation 保存过程，Package 运输成果，Asset 保存正式版本，Execution 保存执行，Learning 提炼经验。</p></div></header><div>{steps.map(([name, description, view], index) => <button type="button" key={name} onClick={() => onNavigate(view)}><span>{index + 1}</span><strong>{name}</strong><small>{description}</small></button>)}</div></section>;
}
