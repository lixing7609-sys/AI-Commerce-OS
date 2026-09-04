import { describe, expect, it } from "vitest";
import { isOperatorPreviewMode } from "./mode";

describe("isOperatorPreviewMode", () => {
  it("is true when mode=operator-preview is present", () => {
    expect(isOperatorPreviewMode("?mode=operator-preview")).toBe(true);
  });

  it("is false when the query string is empty (legacy system unaffected)", () => {
    expect(isOperatorPreviewMode("")).toBe(false);
  });

  it("is false for unrelated query params", () => {
    expect(isOperatorPreviewMode("?foo=bar")).toBe(false);
  });

  it("is false for a near-miss value", () => {
    expect(isOperatorPreviewMode("?mode=operator")).toBe(false);
  });
});
