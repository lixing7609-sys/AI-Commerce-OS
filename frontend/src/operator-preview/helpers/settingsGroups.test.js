import { describe, expect, it } from "vitest";
import { SETTINGS_GROUPS, hasSettingsGroup } from "./settingsGroups";
import { OPERATOR_NAV_ITEMS } from "./navigation";

describe("engineering docs are filed under 系统设置, not the operator nav", () => {
  it("系统设置 exposes a 开发与文档 group", () => {
    expect(hasSettingsGroup("docs")).toBe(true);
    expect(SETTINGS_GROUPS.find((g) => g.key === "docs")?.label).toBe("开发与文档");
  });

  it("系统运行 (Runtime/Consumer) is filed under settings", () => {
    expect(hasSettingsGroup("runtime")).toBe(true);
  });

  it("the operator's main navigation never exposes a 知识库/开发与文档 entry", () => {
    const navLabels = OPERATOR_NAV_ITEMS.map((item) => item.label);
    expect(navLabels).not.toContain("知识库");
    expect(navLabels).not.toContain("开发与文档");
  });
});
