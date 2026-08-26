// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./sino-founder-ai.css", import.meta.url), "utf8");

describe("Sino AI product matrix styles", () => {
  it("keeps the product list typography and vertical rhythm readable", () => {
    const listRule = css.match(/\.sino-product-matrix__list\s*\{([^}]*)\}/)?.[1] || "";
    const itemRule = css.match(/\.sino-product-matrix__item\s*\{([^}]*)\}/)?.[1] || "";
    const titleRule = css.match(/\.sino-product-matrix__item b\s*\{([^}]*)\}/)?.[1] || "";
    const descriptionRule = css.match(/\.sino-product-matrix__item small\s*\{([^}]*)\}/)?.[1] || "";
    expect(listRule).toContain("gap: 4px");
    expect(itemRule).toContain("min-height: 60px");
    expect(itemRule).toContain("padding: 9px 8px");
    expect(titleRule).toContain("font-size: 14px");
    expect(titleRule).toContain("line-height: 20px");
    expect(descriptionRule).toContain("font-size: 12px");
    expect(descriptionRule).toContain("line-height: 18px");
  });
});
