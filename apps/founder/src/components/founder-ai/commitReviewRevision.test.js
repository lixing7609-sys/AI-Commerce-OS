import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyCommitReviewRevision, resolveCommitMessage } from "./commitReviewRevision.js";

const flowSource = await readFile(new URL("./sinoFlow.js", import.meta.url), "utf8");

test("commit message revision is classified before Goal Parser", () => {
  assert.equal(
    classifyCommitReviewRevision("本次代码修改没有问题，请不要修改任何代码，仅修正 Commit Message"),
    "message_only",
  );
  assert.match(flowSource, /currentCommitEntry/);
  assert.match(flowSource, /revise_commit_message/);
  assert.doesNotMatch(flowSource, /routeFounderMessage\(displayText, developerOS\).*currentCommitEntry/);
});

test("message-only revision keeps Candidate identity and derives the approved message", () => {
  const snapshot = {
    candidate: {
      candidate_id: "candidate-1",
      suggested_commit_message: "chore(developer): old message",
    },
    artifact: { diff_summary: "昨日成果 → 昨日开发成果" },
  };
  assert.equal(resolveCommitMessage("仅修正 Commit Message", snapshot), "feat(founder): rename yesterday results card");
});

test("only explicit code-return language permits a new execution request", () => {
  assert.equal(classifyCommitReviewRevision("请退回代码修改"), "code_revision");
  assert.equal(classifyCommitReviewRevision("请补充验收说明：增加首页回归检查"), "acceptance_update");
  assert.equal(classifyCommitReviewRevision("请调整 Rollback Plan：恢复原提交"), "rollback_update");
  assert.equal(classifyCommitReviewRevision("请修改提交摘要：仅更新文案"), "summary_update");
});
