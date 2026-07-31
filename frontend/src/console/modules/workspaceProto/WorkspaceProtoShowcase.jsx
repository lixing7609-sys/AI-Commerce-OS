import { useState } from "react";
import { StudioCanvasProto } from "./StudioCanvasProto.jsx";
import { ShortDramaProjectProto } from "./ShortDramaProjectProto.jsx";
import { OperatorProductOpsProto } from "./OperatorProductOpsProto.jsx";
import { PromptEditorProto } from "./PromptEditorProto.jsx";
import { SinoFUTFullscreenProto } from "./SinoFUTFullscreenProto.jsx";

const PROTOTYPES = [
  { key: "canvas", label: "A · Studio Infinite Canvas", workspaceType: "Canvas Workspace", Component: StudioCanvasProto },
  { key: "drama", label: "B · AI短剧 Project", workspaceType: "Canvas + 辅助视图", Component: ShortDramaProjectProto },
  { key: "ops", label: "C · Operator 商品 Operations", workspaceType: "Operations Workspace", Component: OperatorProductOpsProto },
  { key: "editor", label: "D · Prompt Editor", workspaceType: "Editor Workspace", Component: PromptEditorProto },
  { key: "sinofut", label: "E · SinoFUT Fullscreen", workspaceType: "Fullscreen Shell", Component: SinoFUTFullscreenProto },
];

/**
 * Workspace 母版原型展示台——本轮页面架构重建任务第四阶段的交付物。
 * 只在这里挂载五个母版供产品负责人逐个确认，不接入任何真实业务
 * 路由；全部业务页面的批量迁移在母版确认之后才开始，见
 * docs/workspace-page-mapping.md。
 */
export function WorkspaceProtoShowcase() {
  const [active, setActive] = useState(PROTOTYPES[0].key);
  const current = PROTOTYPES.find((p) => p.key === active);
  const Active = current.Component;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
        <strong style={{ fontSize: 13, marginRight: 8 }}>Workspace 母版原型：</strong>
        {PROTOTYPES.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setActive(p.key)}
            style={{
              fontSize: 12,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid var(--border-default)",
              background: active === p.key ? "var(--action-primary)" : "none",
              color: active === p.key ? "var(--text-inverse)" : "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-tertiary)" }}>类型：{current.workspaceType}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, padding: current.key === "sinofut" ? 0 : 20, overflow: "auto" }}>
        <Active />
      </div>
    </div>
  );
}
