import { useMemo, useState } from "react";

export function ProjectContextSelector({ projects = [], activeProjectId, onSelect, onCreate, disabled = false, allowClear = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const active = projects.find((project) => project.id === activeProjectId);
  const filtered = useMemo(() => projects.filter((project) => `${project.name} ${project.description || ""}`.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);

  async function create(event) {
    event?.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try { await onCreate({ name: name.trim(), description: description.trim() || null }); setName(""); setDescription(""); setCreating(false); setOpen(false); }
    finally { setBusy(false); }
  }

  return <div className="sino-project-selector">
    <button type="button" className="sino-project-selector__trigger" disabled={disabled} aria-label={active ? `当前项目：${active.name}` : "选择项目"} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span aria-hidden="true">📁</span><span>{active?.name || "选择项目"}</span><i aria-hidden="true">▼</i></button>
    {open && <div className="sino-project-selector__popover" role="dialog" aria-label="选择项目">
      <input aria-label="搜索项目" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索项目……" autoFocus />
      <div className="sino-project-selector__list">{filtered.map((project) => <button type="button" key={project.id} className={project.id === activeProjectId ? "is-active" : ""} onClick={() => { onSelect(project.id); setOpen(false); }}>{project.name}</button>)}{!filtered.length && <p>没有匹配的项目</p>}</div>
      {allowClear && activeProjectId && <button type="button" className="sino-project-selector__clear" onClick={() => { onSelect(null); setOpen(false); }}>不选择项目</button>}
      <button type="button" className="sino-project-selector__create" onClick={() => setCreating((value) => !value)}>＋ 创建新项目</button>
      {creating && <div className="sino-project-selector__create-form"><input aria-label="项目名称" value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") create(event); }} placeholder="项目名称" /><textarea aria-label="项目描述" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="可选描述" rows="2" /><button type="button" onClick={create} disabled={busy || !name.trim()}>{busy ? "创建中…" : "创建"}</button></div>}
    </div>}
  </div>;
}
