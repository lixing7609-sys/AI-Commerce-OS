import { ConsoleSidebar } from "./ConsoleSidebar.jsx";
import { ConsoleTopBar } from "./ConsoleTopBar.jsx";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { MODULE_COMPONENTS } from "../moduleRegistry.jsx";
import { DEFAULT_MODULE_KEY, getModuleConfig } from "../nav/navConfig.js";
import { useCapabilities } from "../useCapabilities.js";
import { ErrorBoundary } from "../../shared/ErrorBoundary.jsx";
import { ModuleNotFoundState } from "../kit/ModuleNotFoundState.jsx";
import { PermissionDeniedState } from "../kit/PermissionDeniedState.jsx";
import { RenderErrorState } from "../kit/RenderErrorState.jsx";

export function ConsoleShell() {
  const { module, navigate } = useConsoleNavContext();
  const capabilities = useCapabilities();
  const moduleConfig = getModuleConfig(module);
  const ActiveModule = moduleConfig ? MODULE_COMPONENTS[module] : null;
  const goToDefault = () => navigate(DEFAULT_MODULE_KEY);

  let content;
  if (!moduleConfig) {
    // module key 不在 navConfig.js 的权威列表里——不是权限问题。
    content = <ModuleNotFoundState moduleKey={module} onGoToDefault={goToDefault} />;
  } else if (!capabilities[moduleConfig.requiredCapability]) {
    content = <PermissionDeniedState moduleLabel={moduleConfig.label} />;
  } else if (!ActiveModule) {
    // 已注册在 navConfig 里，但 moduleRegistry.jsx 漏掉了对应组件——
    // 这本身就是需要被看见的配置缺口，不应该悄悄消失。
    content = <ModuleNotFoundState moduleKey={module} onGoToDefault={goToDefault} />;
  } else {
    content = (
      <ErrorBoundary
        key={module}
        renderFallback={(error, retry) => (
          <RenderErrorState
            moduleLabel={moduleConfig.label}
            error={error}
            onRetry={retry}
            onGoToDefault={goToDefault}
          />
        )}
      >
        <ActiveModule />
      </ErrorBoundary>
    );
  }

  return (
    <div className="fdr-root">
      <ConsoleSidebar />
      <div className="fdr-main">
        <ConsoleTopBar />
        <main className="fdr-content">
          <div className="fdr-content__inner">{content}</div>
        </main>
      </div>
    </div>
  );
}
