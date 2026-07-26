import { describe, expect, it } from "vitest";

import { MODULE_COMPONENTS } from "./moduleRegistry.jsx";
import { DEFAULT_MODULE_KEY, FOUNDER_MODULES, getModuleConfig } from "./nav/navConfig.js";
import { CAPABILITY_PROFILES } from "./capabilities.js";

/**
 * 注册表驱动测试（阶段：路由/页面修复）——保证 navConfig.js 里的每
 * 个模块都能在 moduleRegistry.jsx 里解析到一个真实组件，不依赖人工
 * 逐条核对。未来新增模块只要同时出现在这两处，就自动被这份测试
 * 覆盖，不需要专门为新模块补一条新断言。
 */
describe("Founder module registry", () => {
  it("every registered module has a defined component (no undefined/null)", () => {
    for (const module of FOUNDER_MODULES) {
      expect(MODULE_COMPONENTS[module.key], `module "${module.key}" has no component`).toBeTypeOf("function");
    }
  });

  it("adCenter and tokenCenter specifically resolve to real components", () => {
    expect(MODULE_COMPONENTS.adCenter).toBeTypeOf("function");
    expect(MODULE_COMPONENTS.tokenCenter).toBeTypeOf("function");
  });

  it("has no duplicate module keys", () => {
    const keys = FOUNDER_MODULES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("does not register a component for a key that isn't in FOUNDER_MODULES", () => {
    const validKeys = new Set(FOUNDER_MODULES.map((m) => m.key));
    for (const key of Object.keys(MODULE_COMPONENTS)) {
      expect(validKeys.has(key), `moduleRegistry has an orphaned key "${key}" not in navConfig`).toBe(true);
    }
  });

  it("every module the founderOperator capability profile grants has required capability satisfied", () => {
    for (const module of FOUNDER_MODULES) {
      expect(CAPABILITY_PROFILES.founderOperator[module.requiredCapability]).toBe(true);
    }
  });

  it("getModuleConfig returns null for an unrecognized key (safe fallback, not a throw)", () => {
    expect(getModuleConfig("doesNotExist123")).toBeNull();
  });

  it("DEFAULT_MODULE_KEY resolves to a real, registered module", () => {
    expect(getModuleConfig(DEFAULT_MODULE_KEY)).not.toBeNull();
    expect(MODULE_COMPONENTS[DEFAULT_MODULE_KEY]).toBeTypeOf("function");
  });
});
