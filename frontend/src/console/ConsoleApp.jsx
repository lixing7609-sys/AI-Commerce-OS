import "./console.css";
import "./kit/kit.css";
import { useConsoleNav } from "./nav/useConsoleNav.js";
import { ConsoleNavContext } from "./nav/ConsoleNavContext.jsx";
import { ConsoleShell } from "./shell/ConsoleShell.jsx";
import { ToastProvider } from "./kit/ToastProvider.jsx";

/**
 * Founder Operator Edition 根组件（?mode=founder）。是未来受限
 * Operator 正式版的上游共享实现——见 capabilities.js 顶部注释。
 */
export default function ConsoleApp() {
  const nav = useConsoleNav();

  return (
    <ConsoleNavContext.Provider value={nav}>
      <ToastProvider>
        <ConsoleShell />
      </ToastProvider>
    </ConsoleNavContext.Provider>
  );
}
