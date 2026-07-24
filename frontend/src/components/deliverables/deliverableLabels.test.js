import { describe, expect, it } from "vitest";

import {
  extractAnalysisViewProps,
  getDeliverableStatusLabel,
  getDeliverableTypeLabel,
  getExportFormatLabel,
} from "./deliverableLabels";

describe("getDeliverableStatusLabel", () => {
  it("maps known statuses to Chinese labels", () => {
    expect(getDeliverableStatusLabel("pending_review")).toBe("待审核");
    expect(getDeliverableStatusLabel("approved")).toBe("已批准");
    expect(getDeliverableStatusLabel("rejected")).toBe("已驳回");
    expect(getDeliverableStatusLabel("converted_to_task")).toBe("已转任务");
    expect(getDeliverableStatusLabel("archived")).toBe("已归档");
  });

  it("falls back to the raw value for unknown statuses", () => {
    expect(getDeliverableStatusLabel("something_new")).toBe("something_new");
  });
});

describe("getDeliverableTypeLabel", () => {
  it("maps known deliverable types to Chinese labels", () => {
    expect(getDeliverableTypeLabel("ceo_analysis")).toBe("AI CEO 经营分析");
    expect(getDeliverableTypeLabel("sales_analysis")).toBe("销售分析");
    expect(getDeliverableTypeLabel("product_analysis")).toBe("产品分析");
    expect(getDeliverableTypeLabel("general_result")).toBe("通用任务成果");
  });
});

describe("getExportFormatLabel", () => {
  it("maps export formats to display labels", () => {
    expect(getExportFormatLabel("markdown")).toBe("Markdown");
    expect(getExportFormatLabel("pdf")).toBe("PDF");
    expect(getExportFormatLabel("docx")).toBe("Word");
    expect(getExportFormatLabel("xlsx")).toBe("Excel");
    expect(getExportFormatLabel("json")).toBe("JSON");
  });
});

describe("extractAnalysisViewProps", () => {
  it("returns null when there is no current version", () => {
    expect(extractAnalysisViewProps({})).toBeNull();
    expect(extractAnalysisViewProps(null)).toBeNull();
  });

  it("returns text format data as-is", () => {
    const deliverable = {
      deliverable_type: "ceo_analysis",
      current_version_data: { format: "text", structured_content: { text: "纯文本结果" } },
    };
    expect(extractAnalysisViewProps(deliverable)).toEqual({
      format: "text",
      data: { text: "纯文本结果" },
    });
  });

  it("returns structured format data with deliverable type", () => {
    const deliverable = {
      deliverable_type: "sales_analysis",
      current_version_data: {
        format: "structured",
        structured_content: { summary: "摘要" },
      },
    };
    expect(extractAnalysisViewProps(deliverable)).toEqual({
      format: "structured",
      data: { summary: "摘要" },
      type: "sales_analysis",
    });
  });
});
