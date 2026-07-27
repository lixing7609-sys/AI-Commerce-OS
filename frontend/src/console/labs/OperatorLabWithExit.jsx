import OperatorLab from "./OperatorLab.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { DEFAULT_MODULE_KEY } from "../nav/navConfig.js";

/**
 * OperatorLab 内嵌的"返回旧版后台"按钮（`operator-preview/` 自带、
 * 不可编辑的文案）在 Founder 语境下改为退出实验室、回到 Founder 自己
 * 的默认模块——用这个薄适配器把 ConsoleNavContext 接进去，而不是让
 * OperatorLab.jsx 本身依赖 Founder 的导航上下文（保持 OperatorLab
 * 可以被未来任何宿主复用，不和 Founder 的路由耦合）。
 */
export function OperatorLabWithExit() {
  const { navigate } = useConsoleNavContext();
  return <OperatorLab onExit={() => navigate(DEFAULT_MODULE_KEY)} />;
}
