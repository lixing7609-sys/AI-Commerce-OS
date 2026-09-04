import { InfiniteCanvas } from "@sinofut/ui";

const SEED_NODES = [
  { id: "n-brief", type: "brief", label: "机会简报：LED 灯带内容增长机会", x: 40, y: 220 },
  { id: "n-topic", type: "topic", label: "选题：夜晚氛围灯改造合集", x: 260, y: 100 },
  { id: "n-script", type: "script", label: "脚本：3 个转折点的开箱+改造", x: 480, y: 220 },
  { id: "n-storyboard", type: "storyboard", label: "分镜：6 个镜头", x: 700, y: 100 },
  { id: "n-asset", type: "asset", label: "成片：15s 短视频", x: 920, y: 220 },
  { id: "n-approval", type: "approval", label: "人工审批节点", x: 1140, y: 100 },
  { id: "n-publish", type: "publish", label: "发布准备：抖音渠道", x: 1360, y: 220 },
];

const SEED_EDGES = [
  { from: "n-brief", to: "n-topic" },
  { from: "n-topic", to: "n-script" },
  { from: "n-script", to: "n-storyboard" },
  { from: "n-storyboard", to: "n-asset" },
  { from: "n-asset", to: "n-approval" },
  { from: "n-approval", to: "n-publish" },
];

// V2-002 §5.5: 无限画布真正沉浸——去掉外框，工具栏悬浮在画布之上，中间全部是画布本身。
export function CanvasPage() {
  return (
    <InfiniteCanvas
      storageKey="sinofut-studio-canvas"
      initialNodes={SEED_NODES}
      initialEdges={SEED_EDGES}
      immersive
    />
  );
}
