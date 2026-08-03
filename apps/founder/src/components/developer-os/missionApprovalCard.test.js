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
