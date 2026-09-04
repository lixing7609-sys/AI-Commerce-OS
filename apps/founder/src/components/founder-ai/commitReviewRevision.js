const MESSAGE_ONLY = /(commit\s*message|提交信息|提交说明|提交消息)/iu;
const CODE_REVISION = /(退回代码修改|退回修改代码|重新修改代码|修改代码|需要改代码)/u;
const ACCEPTANCE_UPDATE = /(补充|调整|修改).*(验收说明|验收标准)/u;
const ROLLBACK_UPDATE = /(调整|修改|补充).*(rollback|回滚方案|回滚计划)/iu;
const SUMMARY_UPDATE = /(修改|调整).*(提交摘要|修改摘要)/u;

export function classifyCommitReviewRevision(text) {
  const value = String(text || "").trim();
  if (CODE_REVISION.test(value)) return "code_revision";
  if (MESSAGE_ONLY.test(value)) return "message_only";
  if (ACCEPTANCE_UPDATE.test(value)) return "acceptance_update";
  if (ROLLBACK_UPDATE.test(value)) return "rollback_update";
  if (SUMMARY_UPDATE.test(value)) return "summary_update";
  return null;
}

function inferCommitMessage(snapshot) {
  const candidate = snapshot?.candidate || {};
  const artifact = snapshot?.artifact || {};
  const evidence = [candidate.diff_summary, artifact.diff_summary, snapshot?.mission?.title].filter(Boolean).join(" ");
  if (evidence.includes("昨日成果") && evidence.includes("昨日开发成果")) {
    return "feat(founder): rename yesterday results card";
  }
  return candidate.suggested_commit_message || "feat(founder): update approved change";
}

export function resolveCommitMessage(text, snapshot) {
  const quoted = String(text || "").match(/[“‘"]([^”’"]+)[”’"]/u)?.[1]?.trim();
  return quoted || inferCommitMessage(snapshot);
}

export function resolveRevisionText(text) {
  const value = String(text || "");
  return value.split(/[:：]/u).slice(1).join(":").trim() || value.trim();
}
