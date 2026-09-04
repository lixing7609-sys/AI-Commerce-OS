// 验收结果记录 —— 纯函数，产出结构化 review 记录供时间线渲染。

export function buildReview(verdict, notes = "") {
  const label = { pass: "通过", revise: "继续修改", reject: "驳回" }[verdict] || verdict;
  return {
    verdict,
    verdictLabel: label,
    notes,
    reviewedAt: new Date().toISOString(),
  };
}
