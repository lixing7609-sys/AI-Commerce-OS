import { describe, expect, it } from "vitest";

import { parseFilenameFromDisposition } from "./deliverableApi";

describe("parseFilenameFromDisposition", () => {
  it("prefers the UTF-8 filename* parameter when present", () => {
    const header =
      "attachment; filename=\"DLV-ABC123.md\"; filename*=UTF-8''%E7%BB%8F%E8%90%A5%E5%88%86%E6%9E%90.md";
    expect(parseFilenameFromDisposition(header)).toBe("经营分析.md");
  });

  it("falls back to the ASCII filename when filename* is absent", () => {
    const header = 'attachment; filename="DLV-ABC123.md"';
    expect(parseFilenameFromDisposition(header)).toBe("DLV-ABC123.md");
  });

  it("returns null for an empty header", () => {
    expect(parseFilenameFromDisposition("")).toBeNull();
    expect(parseFilenameFromDisposition(null)).toBeNull();
  });

  it("does not throw on a malformed percent-encoded filename*", () => {
    const header = "attachment; filename=\"fallback.md\"; filename*=UTF-8''%E7%zz";
    // 解码失败时应安全回退到 ASCII 文件名，而不是抛出异常。
    expect(parseFilenameFromDisposition(header)).toBe("fallback.md");
  });
});
