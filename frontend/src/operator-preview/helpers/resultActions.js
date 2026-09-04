/**
 * 业务结果详情的操作分组（阶段：产品原型）。
 *
 * 主操作平铺展示；导出类操作全部收进"更多操作"——拆成常量方便
 * 测试断言两者不重叠，防止未来有人把下载操作错误地加回主操作区。
 */
export const PRIMARY_RESULT_ACTIONS = ["批准", "驳回", "要求补充", "创建后续工作", "标记已处理"];

export const SECONDARY_RESULT_ACTIONS = ["复制内容", "查看来源任务"];

export const EXPORT_ACTIONS = ["下载 PDF", "下载 Word", "下载 Excel", "下载 Markdown", "查看 JSON"];

export function isExportAction(action) {
  return EXPORT_ACTIONS.includes(action);
}
