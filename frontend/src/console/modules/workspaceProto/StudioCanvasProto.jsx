import { useState } from "react";
import { CanvasWorkspace } from "../../workspace/CanvasWorkspace.jsx";

const PALETTE = [
  { key: "select", icon: "◇", label: "选择" },
  { key: "beat", icon: "▭", label: "新建故事节点" },
  { key: "agent", icon: "◉", label: "新建 Agent 节点" },
  { key: "asset", icon: "▤", label: "插入素材" },
  { key: "connect", icon: "↝", label: "连线" },
];

const INITIAL_NODES = [
  { id: "n1", kind: "开场", label: "都市重生 EP01：主角遭遇背叛，跌入谷底", x: 60, y: 60 },
  { id: "n2", kind: "AGENT", label: "编剧 Agent · 生成冲突升级三种走向", x: 360, y: 40 },
  { id: "n3", kind: "冲突", label: "反派登场，主角资源被夺", x: 660, y: 80 },
  { id: "n4", kind: "AGENT", label: "分镜 Agent · 已生成 12 个镜头草图", x: 360, y: 260 },
  { id: "n5", kind: "高潮", label: "主角觉醒隐藏身份，绝地反击", x: 660, y: 300 },
  { id: "n6", kind: "结局", label: "EP01 结尾悬念钩子，引导追更 EP02", x: 960, y: 200 },
];

/**
 * 母版 A · Studio Infinite Canvas Workspace。
 * Studio 创作/AI短剧/AI视频/Workflow/Agent 编排/Campaign 的默认工作
 * 环境——真实可拖拽平移缩放的画布，节点可拖动，不是静态示意图。
 */
export function StudioCanvasProto() {
  const [nodes, setNodes] = useState(INITIAL_NODES);
  const [selected, setSelected] = useState(null);

  return (
    <CanvasWorkspace
      title="创作画布 · 《都市重生》EP01"
      subtitle="故事节点 + AI Agent 节点混排——拖动画布平移、滚轮缩放、拖动节点重新编排叙事结构"
      actions={<span style={{ fontSize: 12, color: "var(--ai-accent)" }}>● 3 个 Agent 正在协作生成</span>}
      palette={PALETTE}
      nodes={nodes}
      onNodesChange={setNodes}
      contextPanel={
        <div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>项目上下文</h3>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16 }}>
            《都市重生》第一集 · 目标平台：抖音短剧 · 目标时长 90 秒
          </div>
          <h3 style={{ fontSize: 14, marginBottom: 8 }}>节点详情</h3>
          {nodes.map((n) => (
            <div
              key={n.id}
              onClick={() => setSelected(n.id)}
              style={{
                padding: 8,
                borderRadius: 6,
                cursor: "pointer",
                background: selected === n.id ? "var(--ai-accent-subtle)" : "transparent",
                fontSize: 13,
                marginBottom: 4,
              }}
            >
              <strong>{n.kind}</strong> — {n.label}
            </div>
          ))}
        </div>
      }
    />
  );
}
