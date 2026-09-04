import { useState } from "react";
import { ShortDramaPage } from "./ContentPages.jsx";
import { DirectorWorkspace } from "./DirectorWorkspace.jsx";

/**
 * Studio Lab · AI Short Drama (Charter §3.4) — each content type owns
 * its own end-to-end production pipeline. Promotes the existing
 * `DirectorWorkspace` (already a real 10-stage pipeline: 热点分析→
 * 创作Brief→剧本生成→单集脚本→分镜生成→角色场景生成→生成→AI剪辑→
 * 审核→矩阵发布, see DirectorWorkspace.jsx) from a hidden detail page
 * to the primary landing content — `ShortDramaPage`'s project table
 * becomes the entry screen, selecting a project opens the pipeline
 * inline (no top-level nav change, so this stays the "shortDrama" key
 * throughout, unlike Founder's Agent/Workflow Center composites).
 */
export function ShortDramaWorkbench({ navigate }) {
  const [projectId, setProjectId] = useState(null);

  if (projectId) {
    return <DirectorWorkspace navigate={navigate} params={{ projectId }} />;
  }
  return <ShortDramaPage onSelectProject={setProjectId} />;
}
