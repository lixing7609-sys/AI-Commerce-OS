import { useRef, useState } from "react";
import "./workspace.css";

/**
 * Canvas Workspace — Studio 创作/AI短剧/AI视频/Workflow/Agent 编排/
 * Campaign。语法：左侧工具面板 + 中央可平移缩放的无限画布 + 可选
 * 右侧上下文栏。这不是又一张卡片列表——`nodes` 是可拖拽、绝对定位
 * 在画布坐标系里的对象，画布本身支持拖拽平移（mousedown+drag）和
 * 滚轮缩放，和 Studio V3 原型里"故事板/分镜画布"的真实交互模型
 * 一致，不是静态示意图。
 */
export function CanvasWorkspace({ title, subtitle, actions, palette = [], contextPanel, nodes, onNodesChange }) {
  const [activeTool, setActiveTool] = useState(palette[0]?.key ?? null);
  const [view, setView] = useState({ x: 40, y: 40, scale: 1 });
  const [panning, setPanning] = useState(false);
  const [dragNodeId, setDragNodeId] = useState(null);
  const dragState = useRef(null);

  function handleViewportMouseDown(event) {
    if (event.target !== event.currentTarget && !event.target.classList.contains("ws-canvas__layer")) return;
    event.preventDefault();
    dragState.current = { startX: event.clientX, startY: event.clientY, origin: view };
    setPanning(true);
  }

  function handleNodeMouseDown(event, node) {
    event.stopPropagation();
    dragState.current = { startX: event.clientX, startY: event.clientY, origin: { x: node.x, y: node.y } };
    setDragNodeId(node.id);
  }

  function handleMouseMove(event) {
    if (!dragState.current) return;
    const dx = (event.clientX - dragState.current.startX) / view.scale;
    const dy = (event.clientY - dragState.current.startY) / view.scale;
    if (panning) {
      setView((v) => ({ ...v, x: dragState.current.origin.x + dx * view.scale, y: dragState.current.origin.y + dy * view.scale }));
    } else if (dragNodeId != null && onNodesChange) {
      onNodesChange((prev) =>
        prev.map((n) => (n.id === dragNodeId ? { ...n, x: dragState.current.origin.x + dx, y: dragState.current.origin.y + dy } : n))
      );
    }
  }

  function handleMouseUp() {
    dragState.current = null;
    setPanning(false);
    setDragNodeId(null);
  }

  function handleWheel(event) {
    event.preventDefault();
    const next = Math.min(1.6, Math.max(0.4, view.scale - event.deltaY * 0.001));
    setView((v) => ({ ...v, scale: next }));
  }

  return (
    <div className="ws-shell">
      <div className="ws-header">
        <div className="ws-header__text">
          <h1 className="ws-header__title">{title}</h1>
          {subtitle ? <p className="ws-header__subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="ws-header__actions">{actions}</div> : null}
      </div>
      <div className="ws-body">
        <div className="ws-canvas">
          {palette.length > 0 ? (
            <div className="ws-canvas__palette">
              {palette.map((tool) => (
                <button
                  key={tool.key}
                  type="button"
                  className={"ws-canvas__tool" + (activeTool === tool.key ? " ws-canvas__tool--active" : "")}
                  onClick={() => setActiveTool(tool.key)}
                  title={tool.label}
                  aria-label={tool.label}
                >
                  {tool.icon}
                </button>
              ))}
            </div>
          ) : null}
          <div
            className={"ws-canvas__viewport" + (panning ? " ws-canvas__viewport--panning" : "")}
            onMouseDown={handleViewportMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
          >
            <div
              className="ws-canvas__layer"
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, width: 2000, height: 1400 }}
            >
              {(nodes ?? []).map((node) => (
                <div
                  key={node.id}
                  className={"ws-canvas__node" + (dragNodeId === node.id ? " ws-canvas__node--dragging" : "")}
                  style={{ left: node.x, top: node.y }}
                  onMouseDown={(e) => handleNodeMouseDown(e, node)}
                >
                  <div className="ws-canvas__node-head">{node.kind}</div>
                  <div className="ws-canvas__node-body">{node.label}</div>
                </div>
              ))}
            </div>
            <div className="ws-canvas__zoom">
              <button type="button" onClick={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale - 0.1) }))}>−</button>
              <span>{Math.round(view.scale * 100)}%</span>
              <button type="button" onClick={() => setView((v) => ({ ...v, scale: Math.min(1.6, v.scale + 0.1) }))}>+</button>
            </div>
          </div>
        </div>
        {contextPanel ? <div className="ws-side-panel">{contextPanel}</div> : null}
      </div>
    </div>
  );
}
