import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

test("conversation approval card uses the existing Developer Bridge approval command", () => {
  const flowSource = fs.readFileSync(path.join(here, "../founder-ai/sinoFlow.js"), "utf8");
  assert.match(flowSource, /developerOS\.approve_execution\(planId\)/);
  assert.match(flowSource, /approvingMissionMessages\.has\(messageId\)/);
  assert.doesNotMatch(flowSource, /git\s+(?:add|commit)|\/execute(?:\W|$)/i);
});

test("mission approval is stored as a persistent conversation message", () => {
  const flowSource = fs.readFileSync(path.join(here, "../founder-ai/sinoFlow.js"), "utf8");
  const conversationSource = fs.readFileSync(path.join(here, "../founder-ai/FounderConversation.jsx"), "utf8");
  assert.match(flowSource, /type: "developer-mission-approval"/);
  assert.match(flowSource, /snapshot,/);
  assert.match(conversationSource, /case "developer-mission-approval"/);
  assert.match(conversationSource, /MissionApprovalCard/);
});

test("card exposes formal approve, detail and defer controls", () => {
  const cardSource = fs.readFileSync(path.join(here, "MissionApprovalCard.jsx"), "utf8");
  assert.match(cardSource, /"批准执行"/);
  assert.match(cardSource, /查看方案/);
  assert.match(cardSource, />暂缓</);
  assert.match(cardSource, /disabled=\{busy\}/);
});

test("card renders real Run labels and polls only active SSOT states", () => {
  const cardSource = fs.readFileSync(path.join(here, "MissionApprovalCard.jsx"), "utf8");
  assert.match(cardSource, /RUN_LABELS\[state\]/);
  assert.match(cardSource, /POLLING_STATES\.has\(state\)/);
  assert.match(cardSource, /snapshot\.run\?\.failure_summary/);
  assert.doesNotMatch(cardSource, /授权已处理/);
});

test("waiting commit renders the complete formal Commit Review Package", () => {
  const cardSource = fs.readFileSync(path.join(here, "MissionApprovalCard.jsx"), "utf8");
  for (const label of [
    "Commit Review Package", "修改摘要", "涉及文件", "Diff 摘要", "Tests", "Lint", "Build",
    "风险等级", "建议 Commit Message", "Rollback Plan", "批准提交", "退回修改", "放弃提交", "查看详细变更",
  ]) assert.match(cardSource, new RegExp(label));
  assert.match(cardSource, /waitingCommit && candidate/);
  assert.match(cardSource, /disabled=\{busy\}/);
});

test("committed card renders the real Git result and blocked states cannot approve", () => {
  const cardSource = fs.readFileSync(path.join(here, "MissionApprovalCard.jsx"), "utf8");
  for (const field of ["commit_hash", "commit_message", "committed_files", "branch", "workspace_clean"]) {
    assert.match(cardSource, new RegExp(field));
  }
  assert.match(cardSource, /waitingCommit && candidate/);
  assert.match(cardSource, /const waitingCommit = state === "waiting_commit_approval"/);
  assert.doesNotMatch(cardSource, /const waitingCommit = .*failed|const waitingCommit = .*stale/);
});

test("conversation commit actions reuse Developer OS approve and reject commands", () => {
  const flowSource = fs.readFileSync(path.join(here, "../founder-ai/sinoFlow.js"), "utf8");
  assert.match(flowSource, /developerOS\.approve_commit\(planId\)/);
  assert.match(flowSource, /developerOS\.reject_commit\(planId\)/);
  assert.doesNotMatch(flowSource, /git\s+(?:add|commit)/i);
});
