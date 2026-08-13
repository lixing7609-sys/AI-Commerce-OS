import { ProjectContextSelector } from "./ProjectContextSelector.jsx";

export function ComposerContextControls({ healthy, projects, activeProjectId, onSelectProject, onCreateProject, onFiles }) {
  return <div className="sino-composer-context-controls" aria-label="对话上下文操作">
    <span className="sino-composer-status"><span className={`sino-workspace-status${healthy ? " is-healthy" : " is-unhealthy"}`} aria-label={healthy ? "Sino 正常" : "Sino 服务异常"} /><span>Sino 在线</span></span>
    <ProjectContextSelector projects={projects} activeProjectId={activeProjectId} onSelect={onSelectProject} onCreate={onCreateProject} allowClear />
    <button type="button" className="sino-composer-files" onClick={onFiles}>＋ 文件/文档</button>
  </div>;
}
