import { ConsoleSidebar } from "./ConsoleSidebar.jsx";
import { ConsoleTopBar } from "./ConsoleTopBar.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { MODULE_COMPONENTS } from "../moduleRegistry.jsx";
import { getModuleConfig } from "../nav/navConfig.js";
import { useCapabilities } from "../useCapabilities.js";

export function ConsoleShell() {
  const { module } = useConsoleNavContext();
  const capabilities = useCapabilities();
  const moduleConfig = getModuleConfig(module);
  const ActiveModule = MODULE_COMPONENTS[module];

  const allowed = moduleConfig && capabilities[moduleConfig.requiredCapability];

  return (
    <div className="fdr-root">
      <ConsoleSidebar />
      <div className="fdr-main">
        <ConsoleTopBar />
        <main className="fdr-content">
          {allowed && ActiveModule ? <ActiveModule /> : <p>该模块当前不可用。</p>}
        </main>
      </div>
    </div>
  );
}
