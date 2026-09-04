import { describe, expect, it } from "vitest";
import { businessAssetName, isDeveloperRecord } from "./assetPresentation.js";

describe("Founder asset presentation", () => {
  it("separates a long AI-short-drama goal from the asset business name", () => {
    expect(businessAssetName({ asset_type: "workflow", name: "验证AI短剧生产的可行性，跑通一条稳定可复用的完整链路" })).toBe("AI短剧生产主流程");
    expect(businessAssetName({ asset_type: "prompt", name: "验证AI短剧生产的可行性，跑通一条稳定可复用的完整链路" })).toBe("AI短剧生成 Prompt");
  });
  it("only hides records with explicit test provenance", () => {
    expect(isDeveloperRecord({ title: "Object Native Test" })).toBe(false);
    expect(isDeveloperRecord({ title: "probe", provenance: "test" })).toBe(true);
  });
});
