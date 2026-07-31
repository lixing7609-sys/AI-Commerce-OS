import { SinoWorkspace } from "@sinofut/ui";
import { SINO_PERSONAS } from "@sinofut/domain";

// V2-002 §3.7: SinoFUT 首页不再是固定卡片墙，而是问候 → 输入 → 最近任务/文件/审批/
// 经营/AI 的对话式首页，与全屏模式共用同一个 SinoWorkspace 组件（embedded 变体）。
export function SinoFUTHome() {
  return <SinoWorkspace persona={SINO_PERSONAS.founder} variant="embedded" />;
}
