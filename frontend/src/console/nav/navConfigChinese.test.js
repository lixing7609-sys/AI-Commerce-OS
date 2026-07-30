import { describe, expect, it } from "vitest";
import { FOUNDER_MODULES, NAV_GROUPS } from "./navConfig.js";
import { OPERATOR_V2_NAV_ITEMS } from "../labs/operatorLabV2/navigation.js";
import { NAV_ITEMS as STUDIO_NAV_ITEMS } from "../../studio/navConfig.js";
import { NAV_ITEMS as CLOUD_NAV_ITEMS } from "../../cloud/navConfig.js";

/**
 * Founder Master Edition V1.0 中文框架审查版 §四/§八 — 5 大顶层分组
 * 与全部 51 个可见子项必须使用中文命名。这里不重复断言具体文案
 * 逐字匹配 productReview/reviewManifest.js（那是产品审查数据源），
 * 只断言"不含无意义英文残留"这条全局要求本身。
 */

// 产品要求明确保留的英文品牌名/技术缩写/术语——出现这些不算"遗留英文"。
const ALLOWED_ENGLISH_TOKENS = [
  "AI", "Commerce", "OS", "Founder", "Operator", "Studio", "Cloud", "Center",
  "API", "OTA", "Token", "NAS", "SKU", "GMV", "ROI",
  "Agent", "Agents", "Prompt", "Skill", "Workflow", "Connector", "Marketplace", "IP",
];

function stripAllowedTokens(label) {
  let result = label;
  for (const token of ALLOWED_ENGLISH_TOKENS) {
    result = result.replaceAll(token, "");
  }
  return result;
}

function hasLeftoverEnglish(label) {
  const stripped = stripAllowedTokens(label);
  // 去掉品牌词后，如果还剩连续 2 个以上英文字母，判定为遗留英文。
  return /[A-Za-z]{2,}/.test(stripped);
}

describe("Founder Master Edition V1.0 中文框架审查版 — 导航中文命名", () => {
  it("Founder 顶层 5 个分组全部使用中文/允许的品牌名命名", () => {
    expect(NAV_GROUPS).toHaveLength(5);
    for (const group of NAV_GROUPS) {
      expect(hasLeftoverEnglish(group.label), `分组 "${group.label}" 疑似有未翻译英文`).toBe(false);
    }
  });

  it("Founder 工作台的 8 个可见子项全部中文命名，无遗留英文", () => {
    const items = FOUNDER_MODULES.filter((m) => m.group === "founderWorkspaceGroup" && !m.hiddenFromSidebar);
    expect(items).toHaveLength(8);
    for (const item of items) {
      expect(hasLeftoverEnglish(item.label), `"${item.label}" 疑似有未翻译英文`).toBe(false);
    }
  });

  it("AI 能力中心的 7 个可见子项全部中文命名（Agent/Prompt/Skill/Workflow/Connector 除外）", () => {
    const items = FOUNDER_MODULES.filter((m) => m.group === "aiCapabilityCenterGroup" && !m.hiddenFromSidebar);
    expect(items).toHaveLength(7);
    for (const item of items) {
      expect(hasLeftoverEnglish(item.label), `"${item.label}" 疑似有未翻译英文`).toBe(false);
    }
  });

  it("Operator 实验室的 13 个子项全部中文命名", () => {
    expect(OPERATOR_V2_NAV_ITEMS).toHaveLength(13);
    for (const item of OPERATOR_V2_NAV_ITEMS) {
      expect(hasLeftoverEnglish(item.label), `"${item.label}" 疑似有未翻译英文`).toBe(false);
    }
  });

  it("Studio 实验室的 13 个可见子项全部中文命名", () => {
    const items = STUDIO_NAV_ITEMS.filter((i) => !i.hidden);
    expect(items).toHaveLength(13);
    for (const item of items) {
      expect(hasLeftoverEnglish(item.label), `"${item.label}" 疑似有未翻译英文`).toBe(false);
    }
  });

  it("Cloud Center 的 4 个原生子项 + Founder 侧 6 个组合子项共 10 个，全部中文命名（Marketplace 除外）", () => {
    expect(CLOUD_NAV_ITEMS).toHaveLength(4);
    for (const item of CLOUD_NAV_ITEMS) {
      expect(hasLeftoverEnglish(item.label), `"${item.label}" 疑似有未翻译英文`).toBe(false);
    }
    const founderCloudTailKeys = ["cloudToken", "marketplaceCenter", "cloudVersion", "cloudAssets", "monitoring", "logs"];
    const founderCloudItems = FOUNDER_MODULES.filter((m) => founderCloudTailKeys.includes(m.key));
    expect(founderCloudItems).toHaveLength(6);
    for (const item of founderCloudItems) {
      expect(hasLeftoverEnglish(item.label), `"${item.label}" 疑似有未翻译英文`).toBe(false);
    }
  });

  it("5 组子项总数恰好 51", () => {
    const founderWorkspace = FOUNDER_MODULES.filter((m) => m.group === "founderWorkspaceGroup" && !m.hiddenFromSidebar).length;
    const aiCapability = FOUNDER_MODULES.filter((m) => m.group === "aiCapabilityCenterGroup" && !m.hiddenFromSidebar).length;
    const operatorLab = OPERATOR_V2_NAV_ITEMS.length;
    const studioLab = STUDIO_NAV_ITEMS.filter((i) => !i.hidden).length;
    const cloudCenter = CLOUD_NAV_ITEMS.length + 6;
    expect(founderWorkspace + aiCapability + operatorLab + studioLab + cloudCenter).toBe(51);
  });
});
