import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const NODE_WIDTH = 176;
const NODE_HEIGHT = 92;

const STAGE_META = {
  brief: { label: "机会简报", color: "#9A9A97" },
  topic: { label: "选题", color: "#5B5BD6" },
  script: { label: "脚本", color: "#5B5BD6" },
  storyboard: { label: "分镜", color: "#5B5BD6" },
  asset: { label: "图片/视频", color: "#1E8E5A" },
  approval: { label: "人工审批", color: "#B5750B" },
  publish: { label: "发布准备", color: "#1E8E5A" },
};

function loadFromStorage(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function InfiniteCanvas({ storageKey = "sinofut-studio-canvas", initialNodes, initialEdges, immersive = false, height }) {
  const [nodes, setNodes] = useState(() =>
    loadFromStorage(`${storageKey}:nodes`, initialNodes || [])
  );
  const [edges] = useState(() => loadFromStorage(`${storageKey}:edges`, initialEdges || []));
  const [viewport, setViewport] = useState({ x: 60, y: 40, scale: 1 });
  const [selectedId, setSelectedId] = useState(null);
  const dragRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    window.localStorage.setItem(`${storageKey}:nodes`, JSON.stringify(nodes));
  }, [nodes, storageKey]);

  const onWheel = useCallback((event) => {
    event.preventDefault();
    setViewport((v) => {
      const nextScale = Math.min(2, Math.max(0.4, v.scale - event.deltaY * 0.001));
      return { ...v, scale: nextScale };
    });
  }, []);

  const onPointerDownBackground = useCallback((event) => {
    if (event.target !== containerRef.current) return;
    dragRef.current = { mode: "pan", startX: event.clientX, startY: event.clientY, origin: viewport };
  }, [viewport]);

  const onPointerDownNode = useCallback((event, node) => {
    event.stopPropagation();
    setSelectedId(node.id);
    dragRef.current = {
      mode: "node",
      nodeId: node.id,
      startX: event.clientX,
      startY: event.clientY,
      origin: { x: node.x, y: node.y },
    };
  }, []);

  const onPointerMove = useCallback((event) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (drag.mode === "pan") {
      setViewport((v) => ({ ...v, x: drag.origin.x + dx, y: drag.origin.y + dy }));
    } else if (drag.mode === "node") {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === drag.nodeId
            ? { ...n, x: drag.origin.x + dx / viewport.scale, y: drag.origin.y + dy / viewport.scale }
            : n
        )
      );
    }
  }, [viewport.scale]);

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const addNode = useCallback(() => {
    const types = Object.keys(STAGE_META);
    const type = types[nodes.length % types.length];
    const id = `node-${Date.now()}`;
    setNodes((prev) => [
      ...prev,
      { id, type, label: STAGE_META[type].label, x: 80 + (prev.length % 4) * 60, y: 80 + prev.length * 40 },
    ]);
  }, [nodes.length]);

  const resetView = useCallback(() => setViewport({ x: 60, y: 40, scale: 1 }), []);

  const edgePaths = useMemo(() => {
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
    return edges
      .map((edge) => {
        const from = byId[edge.from];
        const to = byId[edge.to];
        if (!from || !to) return null;
        const x1 = from.x + NODE_WIDTH / 2;
        const y1 = from.y + NODE_HEIGHT / 2;
        const x2 = to.x + NODE_WIDTH / 2;
        const y2 = to.y + NODE_HEIGHT / 2;
        return { key: `${edge.from}-${edge.to}`, x1, y1, x2, y2 };
      })
      .filter(Boolean);
  }, [nodes, edges]);

  return (
    <div className={`sf-canvas-wrapper${immersive ? " is-immersive" : ""}`}>
      <div className="sf-canvas-toolbar">
        <button type="button" className="sf-icon-button" onClick={() => setViewport((v) => ({ ...v, scale: Math.min(2, v.scale + 0.15) }))}>
          放大
        </button>
        <button type="button" className="sf-icon-button" onClick={() => setViewport((v) => ({ ...v, scale: Math.max(0.4, v.scale - 0.15) }))}>
          缩小
        </button>
        <button type="button" className="sf-icon-button" onClick={resetView}>
          重置视图
        </button>
        <button type="button" className="sf-icon-button" onClick={addNode}>
          + 新增节点
        </button>
        <span className="sf-canvas-hint">拖动空白处平移 · 滚轮缩放 · 拖动节点调整位置 · 状态自动保存</span>
      </div>
      <div
        className="sf-canvas-viewport"
        style={height ? { height } : undefined}
        onWheel={onWheel}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div
          className="sf-canvas-surface"
          ref={containerRef}
          onPointerDown={onPointerDownBackground}
          style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
        >
          <svg className="sf-canvas-edges">
            {edgePaths.map((edge) => (
              <line key={edge.key} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
            ))}
          </svg>
          {nodes.map((node) => (
            <div
              key={node.id}
              className={`sf-canvas-node${selectedId === node.id ? " is-selected" : ""}`}
              style={{ left: node.x, top: node.y, borderColor: STAGE_META[node.type]?.color }}
              onPointerDown={(event) => onPointerDownNode(event, node)}
            >
              <span className="sf-canvas-node-type" style={{ color: STAGE_META[node.type]?.color }}>
                {STAGE_META[node.type]?.label || node.type}
              </span>
              <span className="sf-canvas-node-label">{node.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { STAGE_META as CANVAS_STAGE_META };
