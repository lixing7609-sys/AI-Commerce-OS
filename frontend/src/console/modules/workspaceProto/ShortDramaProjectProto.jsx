import { useState } from "react";
import { CanvasWorkspace } from "../../workspace/CanvasWorkspace.jsx";
import "../../workspace/workspace.css";

const TABS = [
  { key: "canvas", label: "创作画布" },
  { key: "episodes", label: "剧集视图" },
  { key: "script", label: "剧本视图" },
  { key: "characters", label: "角色视图" },
  { key: "storyboard", label: "分镜视图" },
  { key: "generation", label: "生成与剪辑" },
  { key: "approval", label: "审核授权" },
  { key: "publish", label: "发布状态" },
];

const EPISODES = [
  { id: "ep1", title: "EP01 · 谷底反转", status: "已发布", stage: "已上线" },
  { id: "ep2", title: "EP02 · 身份浮现", status: "剪辑中", stage: "生成与剪辑" },
  { id: "ep3", title: "EP03 · 绝地反击", status: "剧本审核中", stage: "审核授权" },
  { id: "ep4", title: "EP04 · 终局对决", status: "选题策划中", stage: "项目上下文" },
];

const CHARACTERS = [
  { id: "c1", name: "林晚", role: "女主角", icon: "👤" },
  { id: "c2", name: "陆行舟", role: "男主角", icon: "👤" },
  { id: "c3", name: "苏氏集团", role: "反派", icon: "🏢" },
  { id: "c4", name: "老周", role: "配角 · 引路人", icon: "👤" },
];

const CANVAS_NODES = [
  { id: "n1", kind: "剧集", label: "EP02：身份浮现，主角能力觉醒", x: 60, y: 80 },
  { id: "n2", kind: "AGENT", label: "分镜 Agent 建议：8 秒特写强化情绪", x: 380, y: 40 },
  { id: "n3", kind: "剧集", label: "EP03：绝地反击，正面冲突", x: 700, y: 100 },
];

function ContextPanel({ activeTab }) {
  return (
    <div>
      <h3 style={{ fontSize: 14, marginBottom: 8 }}>项目上下文</h3>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.7 }}>
        项目：《都市重生》
        <br />
        当前视图：{TABS.find((t) => t.key === activeTab)?.label}
        <br />
        目标平台：抖音 / 快手短剧频道
        <br />
        总集数：12 集 · 已完成 1 集
      </div>
      <h3 style={{ fontSize: 14, margin: "16px 0 8px" }}>AI 建议</h3>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        EP02 剪辑节奏偏慢，建议压缩开场铺垫 4 秒，提升完播率。
      </div>
    </div>
  );
}

/**
 * 母版 B · AI短剧 Project Workspace。
 * 默认呈现创作画布，不是"项目表+角色表+进度表"的纵向后台列表——
 * 剧集/角色/进度作为辅助视图通过顶部标签切换进入，右侧上下文栏
 * 始终可见。
 */
export function ShortDramaProjectProto() {
  const [tab, setTab] = useState("canvas");
  const [nodes, setNodes] = useState(CANVAS_NODES);

  let body;
  if (tab === "canvas") {
    return (
      <div className="ws-shell">
        <ProjectTabs tab={tab} setTab={setTab} />
        <div style={{ flex: 1, minHeight: 0 }}>
          <CanvasWorkspace
            title=""
            palette={[{ key: "beat", icon: "▭", label: "新建剧集节点" }, { key: "agent", icon: "◉", label: "Agent 建议" }]}
            nodes={nodes}
            onNodesChange={setNodes}
            contextPanel={<ContextPanel activeTab={tab} />}
          />
        </div>
      </div>
    );
  }

  if (tab === "episodes") {
    body = (
      <div className="ws-ops__queue">
        {EPISODES.map((ep) => (
          <div className="ws-ops__row" key={ep.id}>
            <div className="ws-ops__row-thumb">▶</div>
            <div className="ws-ops__row-body">
              <div className="ws-ops__row-title">{ep.title}</div>
              <div className="ws-ops__row-context">当前阶段：{ep.stage}</div>
            </div>
            <div className="ws-ops__row-actions"><span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{ep.status}</span></div>
          </div>
        ))}
      </div>
    );
  } else if (tab === "characters") {
    body = (
      <div className="ws-asset__grid" style={{ flex: 1 }}>
        {CHARACTERS.map((c) => (
          <div className="ws-asset__tile" key={c.id}>
            <div className="ws-asset__tile-thumb">{c.icon}</div>
            <div className="ws-asset__tile-meta">
              <div className="ws-asset__tile-title">{c.name}</div>
              <div className="ws-asset__tile-sub">{c.role}</div>
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    body = (
      <div style={{ padding: 24, color: "var(--text-secondary)", fontSize: 13 }}>
        {TABS.find((t) => t.key === tab)?.label} — 辅助视图占位，母版确认后随对应业务页面一起接入真实数据。
      </div>
    );
  }

  return (
    <div className="ws-shell">
      <ProjectTabs tab={tab} setTab={setTab} />
      <div className="ws-body">
        {body}
        <div className="ws-side-panel"><ContextPanel activeTab={tab} /></div>
      </div>
    </div>
  );
}

function ProjectTabs({ tab, setTab }) {
  return (
    <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => setTab(t.key)}
          className={"ws-ops__toggle-btn" + (tab === t.key ? " ws-ops__toggle-btn--active" : "")}
          style={{ border: "1px solid var(--border-default)" }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
