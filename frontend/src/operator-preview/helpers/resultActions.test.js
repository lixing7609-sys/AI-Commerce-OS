import { describe, expect, it } from "vitest";
import {
  EXPORT_ACTIONS,
  PRIMARY_RESULT_ACTIONS,
  SECONDARY_RESULT_ACTIONS,
  isExportAction,
} from "./resultActions";

describe("export actions live under 更多操作, not the primary action row", () => {
  it("export/download actions are isolated from primary actions", () => {
    for (const action of EXPORT_ACTIONS) {
      expect(PRIMARY_RESULT_ACTIONS).not.toContain(action);
      expect(SECONDARY_RESULT_ACTIONS).not.toContain(action);
    }
  });

  it("includes all five required export formats plus raw JSON", () => {
    expect(EXPORT_ACTIONS).toEqual(
      expect.arrayContaining(["下载 PDF", "下载 Word", "下载 Excel", "下载 Markdown", "查看 JSON"])
    );
  });

  it("isExportAction correctly classifies actions", () => {
    expect(isExportAction("下载 PDF")).toBe(true);
    expect(isExportAction("批准")).toBe(false);
  });

  it("primary actions cover the required business decisions", () => {
    expect(PRIMARY_RESULT_ACTIONS).toEqual(
      expect.arrayContaining(["批准", "驳回", "要求补充", "创建后续工作", "标记已处理"])
    );
  });
});
