import { useEffect, useMemo, useRef, useState } from "react";
import { getFounderObject, getFounderObjects } from "../services/founderAiApi.js";

export const OBJECT_WORKSPACE_VIEWS = {
  builder: { kicker: "Architecture View", title: "系统构建器", types: ["application_system", "project", "agent", "skill", "workflow", "prompt", "capability", "connector", "task"] },
  "capability-center": { kicker: "Capability View", title: "能力中心", types: ["capability", "agent", "skill", "workflow", "prompt", "connector"] },
  execution: { kicker: "Execution View", title: "执行中心", types: ["application_system", "project", "agent", "skill", "workflow", "prompt", "capability", "connector", "task"] },
  assets: { kicker: "Evolution View", title: "资产与记忆", types: ["application_system", "project", "agent", "skill", "workflow", "prompt", "capability", "connector", "task", "artifact", "decision", "knowledge", "memory"] },
};

const visibleInView = (item, view) => {
  if (!OBJECT_WORKSPACE_VIEWS[view]?.types.includes(item.object_type)) return false;
  if (view === "execution") return item.status === "approved" || item.execution_refs?.length;
  return true;
};

export function projectFounderObjects(objects, view) {
  const base = objects.filter((item) => visibleInView(item, view));
  const nodes = base.map((item) => ({ ...item, node_id: item.object_id, node_kind: "object", root_object_id: item.object_id }));
  const edges = base.flatMap((item) => [
    ...(item.parent_object_id ? [{ from: item.parent_object_id, to: item.object_id, relation: "parent-child" }] : []),
    ...(item.dependency_object_ids || []).map((id) => ({ from: item.object_id, to: id, relation: "dependency" })),
    ...(item.related_object_ids || []).map((id) => ({ from: item.object_id, to: id, relation: "related" })),
  ]);
  if (view === "execution") {
    for (const item of base) {
      const reference = item.execution_refs?.at(-1);
      if (!reference) continue;
      const status = reference.status === "draft" ? "Waiting Development" : reference.status;
      nodes.push({ node_id: `execution:${reference.execution_id}`, node_kind: "execution", root_object_id: item.object_id, object_type: "execution", type_label: "Execution", name: status, status: reference.status, version: item.version, execution_ref: reference });
      edges.push({ from: item.object_id, to: `execution:${reference.execution_id}`, relation: "execution" });
    }
  }
  if (view === "assets") {
    for (const item of base) {
      for (const revision of item.revisions || []) {
        nodes.push({ ...revision, node_id: `revision:${revision.revision_id}`, node_kind: "revision", root_object_id: item.object_id, object_type: "revision", type_label: "Revision", name: `${item.name} · V${revision.version}`, status: revision.status });
      }
      const versions = (item.revisions || []).map((revision) => `revision:${revision.revision_id}`);
      versions.forEach((nodeId, index) => edges.push({ from: index ? versions[index - 1] : item.object_id, to: nodeId, relation: "version" }));
      (item.artifact_refs || []).forEach((id) => { const nodeId = `artifact:${id}`; nodes.push({ node_id: nodeId, node_kind: "artifact", root_object_id: item.object_id, object_type: "artifact", type_label: "Artifact", name: id, status: "persisted", version: item.version }); edges.push({ from: item.object_id, to: nodeId, relation: "artifact" }); });
      (item.memory_refs || []).forEach((id) => { const nodeId = `memory:${id}`; nodes.push({ node_id: nodeId, node_kind: "memory", root_object_id: item.object_id, object_type: "memory", type_label: "Memory", name: id, status: "persisted", version: item.version }); edges.push({ from: item.object_id, to: nodeId, relation: "memory" }); });
    }
  }
  const nodeIds = new Set(nodes.map((item) => item.node_id));
  return { nodes, edges: edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to)) };
}

export function ObjectInspector({ object, onContinue, onApprove, onOpenExecution, onShowRevisions }) {
  if (!object) return <section className="sino-object-inspector-panel" aria-label="Object Inspector"><span className="sino-kicker">Object Inspector</span><h2>当前未选择对象</h2><p>点击画布中的 Object 查看：版本、依赖、执行、资产、记忆和历史。</p></section>;
  const executionStatus = object.execution_refs?.at(-1)?.status;
  return <section className="sino-object-inspector-panel" aria-label="Object Inspector"><span className="sino-kicker">{object.type_label}</span><h2>{object.name}</h2><p>{object.description || "暂无说明"}</p><dl><div><dt>Stable object_id</dt><dd>{object.object_id}</dd></div><div><dt>Status</dt><dd>{object.status === "approved" ? "Approved" : object.status}</dd></div><div><dt>Version</dt><dd>V{object.version}</dd></div><div><dt>Source Conversation</dt><dd>{object.source_conversation_id || "—"}</dd></div><div><dt>Parent</dt><dd>{object.parent_object_id || "—"}</dd></div><div><dt>Children</dt><dd>{object.child_object_ids?.join(" · ") || "—"}</dd></div><div><dt>Dependencies</dt><dd>{object.dependency_object_ids?.join(" · ") || "—"}</dd></div><div><dt>Related Objects</dt><dd>{object.related_object_ids?.join(" · ") || "—"}</dd></div><div><dt>Execution</dt><dd>{executionStatus === "draft" ? "Waiting Development" : executionStatus || "—"}</dd></div><div><dt>Artifact</dt><dd>{object.artifact_refs?.length || 0}</dd></div><div><dt>Memory</dt><dd>{object.memory_refs?.length || 0}</dd></div><div><dt>Revision History</dt><dd>{object.revisions?.length || 0}</dd></div></dl><footer><button type="button" onClick={() => onContinue(object)}>继续讨论</button>{object.status !== "approved" && <button type="button" onClick={() => onApprove(object)}>批准</button>}{object.execution_refs?.length ? <button type="button" onClick={() => onOpenExecution(object)}>查看执行</button> : null}<button type="button" onClick={() => onShowRevisions?.(object)}>查看历史版本</button></footer></section>;
}

export function InfiniteObjectWorkspace({ view, selectedObject, onSelectionChange, refreshKey = 0 }) {
  const viewportRef = useRef(null);
  const dragRef = useRef(null);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1 });
  const definition = OBJECT_WORKSPACE_VIEWS[view] || OBJECT_WORKSPACE_VIEWS.builder;
  const projection = useMemo(() => projectFounderObjects(objects, view), [objects, view]);
  const visible = projection.nodes;
  const positions = useMemo(() => Object.fromEntries(visible.map((item, index) => [item.node_id, { x: (index % 3) * 280, y: Math.floor(index / 3) * 190 }])), [visible]);
  const relations = projection.edges;

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); onSelectionChange(null);
    getFounderObjects().then((items) => { if (active) { setObjects(items); setLoading(false); } }).catch((requestError) => { if (active) { setError(requestError.message); setLoading(false); } });
    return () => { active = false; };
  }, [view, refreshKey, onSelectionChange]);

  function fitToObjects() {
    const viewport = viewportRef.current;
    if (!viewport || !visible.length) { setCamera({ x: 36, y: 36, scale: 1 }); return; }
    const columns = Math.min(3, visible.length);
    const rows = Math.ceil(visible.length / 3);
    const contentWidth = (columns - 1) * 280 + 236;
    const contentHeight = (rows - 1) * 190 + 132;
    const scale = Math.min(1.15, Math.max(.55, Math.min((viewport.clientWidth - 96) / contentWidth, (viewport.clientHeight - 96) / contentHeight)));
    setCamera({ x: (viewport.clientWidth - contentWidth * scale) / 2, y: (viewport.clientHeight - contentHeight * scale) / 2, scale });
  }

  useEffect(() => { if (!loading) window.requestAnimationFrame(fitToObjects); }, [loading, view, visible.length]);

  async function selectObject(item) {
    try { onSelectionChange({ ...(await getFounderObject(item.root_object_id)), projection_node: item }); }
    catch (requestError) { setError(requestError.message); }
  }

  function startPan(event) {
    if (event.button !== 0 || event.target.closest("button, article")) return;
    dragRef.current = { x: event.clientX, y: event.clientY, camera };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pan(event) {
    const origin = dragRef.current;
    if (!origin) return;
    setCamera({ ...origin.camera, x: origin.camera.x + event.clientX - origin.x, y: origin.camera.y + event.clientY - origin.y });
  }
  function stopPan() { dragRef.current = null; }
  function zoom(event) {
    event.preventDefault();
    setCamera((current) => ({ ...current, scale: Math.min(1.6, Math.max(.55, current.scale + (event.deltaY < 0 ? .1 : -.1))) }));
  }

  return <section className="sino-infinite-workspace" aria-label={`${definition.title} Infinite Workspace`}>
    <header className="sino-infinite-workspace__header"><div><span className="sino-kicker">{definition.kicker}</span><h1>{definition.title}</h1><p>同一 Founder Object Layer 的 {definition.kicker}</p></div><div className="sino-infinite-workspace__controls"><button type="button" onClick={fitToObjects}>适应视图</button><span>{Math.round(camera.scale * 100)}%</span></div></header>
    <div ref={viewportRef} className="sino-object-canvas" onPointerDown={startPan} onPointerMove={pan} onPointerUp={stopPan} onPointerCancel={stopPan} onWheel={zoom}>
      <div className="sino-object-canvas__plane" style={{ transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
        <svg className="sino-object-relations" width="1000" height="1000" aria-label="Object Relationships">{relations.map((relation) => { const from = positions[relation.from]; const to = positions[relation.to]; return <g key={`${relation.from}-${relation.to}-${relation.relation}`}><line x1={from.x + 118} y1={from.y + 66} x2={to.x + 118} y2={to.y + 66} /><text x={(from.x + to.x) / 2 + 118} y={(from.y + to.y) / 2 + 56}>{relation.relation}</text></g>; })}</svg>
        {visible.map((item) => <button type="button" key={item.node_id} className={`sino-object-node sino-object-node--${item.node_kind}${selectedObject?.projection_node?.node_id === item.node_id || selectedObject?.object_id === item.node_id ? " is-active" : ""}`} style={{ left: `${positions[item.node_id].x}px`, top: `${positions[item.node_id].y}px` }} onClick={() => selectObject(item)}><span>{item.type_label}</span><strong>{item.name}</strong><small>{item.node_kind === "revision" ? `V${item.version}` : `V${item.version} · ${item.status === "approved" ? "Approved" : item.status === "draft" ? "Draft" : item.status}`}</small>{item.node_kind === "object" && item.execution_refs?.length ? <em>Execution · {item.execution_refs.at(-1).status}</em> : null}</button>)}
      </div>
      {loading && <p className="sino-object-canvas__state">正在读取 Founder Object Layer…</p>}
      {!loading && !error && !visible.length && <p className="sino-object-canvas__state">当前 View 暂无匹配对象。对象仍保存在统一 Object Layer 中。</p>}
      {error && <p className="sino-object-canvas__state is-error">{error}</p>}
      <div className="sino-object-canvas__hint">拖拽平移 · 滚轮缩放</div>
    </div>
  </section>;
}
