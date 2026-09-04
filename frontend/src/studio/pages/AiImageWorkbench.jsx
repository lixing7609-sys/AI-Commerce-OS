import { useState } from "react";
import { GraphicContentListPage, GraphicContentEditorPage } from "./GraphicContentPages.jsx";

/**
 * Studio Lab · AI Image (Charter §3.4) — promotes the existing
 * `GraphicContentEditorPage` (already a 3-column workbench: Idea/
 * Prompt → Generate → Edit → Review → Asset Library) from hidden
 * detail page to primary landing content, with `GraphicContentListPage`
 * as the entry screen. A local `navigate` shim intercepts the list
 * page's `navigate("graphicContentEditor", {projectId})` call and
 * switches local state instead of the top-level module key, so this
 * stays under the "graphicContent" nav item throughout.
 */
export function AiImageWorkbench({ navigate }) {
  const [projectId, setProjectId] = useState(null);

  function localNavigate(key, params = {}) {
    if (key === "graphicContentEditor") {
      setProjectId(params.projectId ?? null);
      return;
    }
    if (key === "graphicContent") {
      setProjectId(null);
      return;
    }
    navigate(key, params);
  }

  if (projectId) {
    return <GraphicContentEditorPage navigate={localNavigate} params={{ projectId }} />;
  }
  return <GraphicContentListPage navigate={localNavigate} />;
}
