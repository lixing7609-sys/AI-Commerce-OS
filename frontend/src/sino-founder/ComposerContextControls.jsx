import { ProjectContextSelector } from "./ProjectContextSelector.jsx";
import { sinoStatus } from "./founderStatus.js";

export function ComposerContextControls({ healthy, projects, activeProjectId, onSelectProject, onCreateProject, onFiles }) {
  const status = sinoStatus(healthy);
  return <div className="sino-composer-context-controls" aria-label="对话上下文操作">
    <span className="sino-composer-status"><span className={`sino-workspace-status ${status.className}`} aria-label={`Sino ${status.label}`} /><span>Sino {status.label}</span></span>
    <ProjectContextSelector projects={projects} activeProjectId={activeProjectId} onSelect={onSelectProject} onCreate={onCreateProject} allowClear />
    <button type="button" className="sino-composer-files" onClick={onFiles}>＋ 文件/文档</button>
  </div>;
}
