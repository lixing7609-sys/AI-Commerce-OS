import { useEffect, useMemo, useState } from "react";
import { getFounderObject, getFounderObjects } from "../services/founderAiApi.js";
import { objectTypeLabel, statusLabel } from "./founderTerminology.js";

const CAPABILITY_TYPES = ["agent", "skill", "workflow", "prompt", "capability"];
const STATUS_KEY = "sino-founder-capability-status-overrides";
const TYPE_MODULES = {
  agent: ["Definition", "Instructions", "Skills", "Workflows", "Prompts", "Models", "Connectors", "Knowledge", "Permissions", "Tests", "Versions", "Used By"],
  skill: ["Definition", "Input / Output", "Logic", "Prompt", "Model Requirement", "Dependencies", "Test Cases", "Versions", "Used By"],
  workflow: ["Definition", "Trigger", "Steps", "Agents", "Skills", "Conditions", "Inputs / Outputs", "Error Handling", "Tests", "Versions"],
  prompt: ["Definition", "System Prompt", "User Template", "Variables", "Model", "Output Format", "Test Cases", "Versions", "Used By"],
  capability: ["Definition", "Components", "Input / Output", "Supported Apps", "Dependencies", "Tests", "Versions", "Usage"],
  project: ["Project Context", "Discussions", "Related Agents", "Related Skills", "Related Workflows", "Related Prompts", "Related Capabilities", "Files", "Decisions", "Knowledge"],
};
const readOverrides = () => { try { return JSON.parse(localStorage.getItem(STATUS_KEY) || "{}"); } catch { return {}; } };
const displayStatus = (value) => ({ draft: "草稿", testing: "测试中", ready: "待发布", published: "已发布", approved: "待发布" }[value] || statusLabel(value));

export function CapabilityCenter({ onOpenObject }) {
  const [objects, setObjects] = useState([]);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const overrides = readOverrides();
  useEffect(() => { getFounderObjects().then(setObjects).catch((reason) => setError(reason.message)); }, []);
  const visible = useMemo(() => objects.filter((item) => CAPABILITY_TYPES.includes(item.object_type) && (filter === "all" || item.object_type === filter)), [objects, filter]);
  return <section className="sino-capability-library" aria-label="AI 能力中心">
    <header><div><span className="sino-kicker">AI Capability Center</span><h1>AI 能力中心</h1><p>管理已形成的 Agent、Skill、Workflow、Prompt 与 Capability。</p></div></header>
    <nav aria-label="能力类型筛选">{[["all","全部"],["agent","Agent"],["skill","Skill"],["workflow","Workflow"],["prompt","Prompt"],["capability","Capability"]].map(([key,label]) => <button key={key} className={filter === key ? "is-active" : ""} onClick={() => setFilter(key)}>{label}</button>)}</nav>
    {error && <p role="alert">{error}</p>}
    <div className="sino-capability-library__list">{visible.map((item) => <button type="button" key={item.object_id} onClick={() => onOpenObject(item)}><div><span>{objectTypeLabel(item.object_type, item.type_label)}</span><strong>{item.name}</strong><p>{item.description || "暂无说明"}</p></div><dl><div><dt>状态</dt><dd>{displayStatus(overrides[item.object_id] || item.status)}</dd></div><div><dt>版本</dt><dd>V{item.version || 1}</dd></div><div><dt>Used By</dt><dd>{item.used_by?.join?.(" · ") || "尚未发布给应用"}</dd></div><div><dt>更新</dt><dd>{item.updated_at ? new Date(item.updated_at).toLocaleDateString("zh-CN") : "暂无"}</dd></div></dl></button>)}</div>
    {!error && !visible.length && <p className="sino-capability-library__empty">还没有真实能力对象。通过 Sino 讨论并批准后，会自动出现在这里。</p>}
  </section>;
}

export function CapabilityObjectWorkspace({ object: initialObject, onContinue, onOpenExecution }) {
  const [object, setObject] = useState(initialObject);
  const [activeModule, setActiveModule] = useState("Definition");
  const [status, setStatus] = useState(() => readOverrides()[initialObject?.object_id] || initialObject?.status || "draft");
  useEffect(() => { if (initialObject?.object_id) getFounderObject(initialObject.object_id).then(setObject).catch(() => {}); }, [initialObject?.object_id]);
  if (!object) return <section className="sino-capability-object"><p>当前未选择对象。</p></section>;
  const modules = TYPE_MODULES[object.object_type] || TYPE_MODULES.capability;
  const execution = object.execution_refs?.at(-1);
  const setLifecycle = (next) => { const values = { ...readOverrides(), [object.object_id]: next }; localStorage.setItem(STATUS_KEY, JSON.stringify(values)); setStatus(next); };
  const content = {
    "Definition": object.description || "继续与 Sino 讨论，完善这个对象的定义、目标与边界。",
    "Dependencies": object.dependency_object_ids?.join(" · ") || "暂无依赖对象",
    "Versions": object.revisions?.length ? object.revisions.map((item) => `V${item.version}`).join(" · ") : `V${object.version || 1}`,
    "Used By": object.used_by?.join?.(" · ") || "尚未发布给应用",
    "Usage": object.used_by?.join?.(" · ") || "尚未发布给应用",
    "Tests": status === "testing" ? "测试运行中。完成验证后可标记为待发布。" : "尚未运行测试。",
    "Test Cases": status === "testing" ? "测试运行中。完成验证后可标记为待发布。" : "尚未配置测试用例。",
  }[activeModule] || `该模块已预留在统一 ${objectTypeLabel(object.object_type, object.type_label)} 工作区中，可通过继续讨论逐步完善。`;
  return <section className="sino-capability-object" aria-label={`${object.name} 对象工作区`}>
    <header><div><span>{objectTypeLabel(object.object_type, object.type_label)}</span><h1>{object.name}</h1><p>{displayStatus(status)} · V{object.version || 1}</p></div><div className="sino-capability-object__actions"><button onClick={() => onContinue(object)}>继续讨论</button><button onClick={() => setLifecycle(status === "testing" ? "ready" : "testing")}>{status === "testing" ? "完成测试" : "测试"}</button><button className="is-primary" disabled={!['ready','approved','published'].includes(status)} onClick={() => setLifecycle("published")}>发布</button></div></header>
    <div className="sino-capability-object__meta"><span>创建时间 {object.created_at ? new Date(object.created_at).toLocaleString("zh-CN") : "暂无"}</span><span>最后修改 {object.updated_at ? new Date(object.updated_at).toLocaleString("zh-CN") : "暂无"}</span>{execution && <button onClick={() => onOpenExecution(object)}>开发任务 · {statusLabel(execution.status, { execution: true })}</button>}</div>
    <div className="sino-capability-object__body"><nav aria-label="对象模块">{modules.map((module) => <button key={module} className={activeModule === module ? "is-active" : ""} onClick={() => setActiveModule(module)}>{module}</button>)}</nav><article><span>{activeModule}</span><h2>{activeModule === "Definition" ? "能力定义" : activeModule}</h2><p>{content}</p>{activeModule === "Definition" && <dl><div><dt>Object ID</dt><dd>{object.object_id}</dd></div><div><dt>来源 Conversation</dt><dd>{object.source_conversation_id || "暂无"}</dd></div><div><dt>当前状态</dt><dd>{displayStatus(status)}</dd></div><div><dt>当前版本</dt><dd>V{object.version || 1}</dd></div></dl>}</article></div>
  </section>;
}
