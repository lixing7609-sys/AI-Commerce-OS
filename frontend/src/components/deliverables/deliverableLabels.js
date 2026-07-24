export const DELIVERABLE_STATUS_LABELS = {
  draft: "草稿",
  pending_review: "待审核",
  approved: "已批准",
  rejected: "已驳回",
  converted_to_task: "已转任务",
  archived: "已归档",
};

export function getDeliverableStatusLabel(status) {
  return DELIVERABLE_STATUS_LABELS[status] ?? status;
}

export const DELIVERABLE_TYPE_LABELS = {
  ceo_analysis: "AI CEO 经营分析",
  sales_analysis: "销售分析",
  product_analysis: "产品分析",
  general_result: "通用任务成果",
};

export function getDeliverableTypeLabel(deliverableType) {
  return DELIVERABLE_TYPE_LABELS[deliverableType] ?? deliverableType;
}

export const DELIVERABLE_STATUS_FILTERS = [
  { value: "all", label: "全部" },
  { value: "pending_review", label: "待审核" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已驳回" },
  { value: "converted_to_task", label: "已转任务" },
  { value: "archived", label: "已归档" },
];

export const DELIVERABLE_TYPE_FILTERS = [
  { value: "all", label: "全部类型" },
  { value: "ceo_analysis", label: "AI CEO" },
  { value: "sales_analysis", label: "销售 Agent" },
  { value: "product_analysis", label: "产品 Agent" },
  { value: "general_result", label: "通用成果" },
];

const EXPORT_FORMAT_LABELS = {
  markdown: "Markdown",
  pdf: "PDF",
  docx: "Word",
  xlsx: "Excel",
  json: "JSON",
};

export function getExportFormatLabel(format) {
  return EXPORT_FORMAT_LABELS[format] ?? format;
}

/**
 * 把后端成果详情响应里已经安全清洗过的结构化内容映射为
 * analysisViews 组件可以直接渲染的 {format, data} 结构；不做任何
 * 额外脱敏（后端已经完成），只做字段名适配。deliverable_type 未知
 * 或 current_version_data 缺失时返回 null，调用方应回退到纯文本/
 * JSON 展示。
 */
export function extractAnalysisViewProps(deliverable) {
  const version = deliverable?.current_version_data;

  if (!version) {
    return null;
  }

  if (version.format === "text") {
    return { format: "text", data: version.structured_content };
  }

  return { format: "structured", data: version.structured_content, type: deliverable.deliverable_type };
}
