import StudioLab from "./StudioLab.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";

/**
 * 薄适配器——把 Founder 的 ConsoleNavContext 接进 StudioLab，只做
 * 一件事：把 `subView`（旧 内容中心/AI直播中心/流量网络中心 重定向
 * 目标，见 navConfig.js 的 MODULE_REDIRECTS）转成 StudioLab 的
 * `initialPage`。StudioLab.jsx 本身不依赖 Founder 的导航上下文，
 * 保持可以被未来任何宿主复用。
 */
export function StudioLabConnected() {
  const { subView } = useConsoleNavContext();
  return <StudioLab initialPage={subView} />;
}
