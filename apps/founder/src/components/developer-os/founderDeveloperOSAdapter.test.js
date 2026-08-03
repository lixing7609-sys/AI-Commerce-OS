import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createFounderDeveloperOSAdapter, normalizeDeveloperOSSnapshot } from "./founderDeveloperOSAdapter.js";

const workspace = { id: "ai-commerce-os", name: "AI Commerce OS", path: "/approved/workspace", branch: "main", baseline: "abc", dirty: false };
const basePlan = {
  plan_id: "plan-1", workspace_id: "ai-commerce-os",
  mission: { id: "mission-1", title: "接入 Founder", dependencies: [] },
  summary: { why_now: "今天最有价值", expected_result: "形成日常入口", risk_level: "low", blocked_missions: [] },
  execution_scope: { target_files: ["apps/founder/src/pages/FounderHome.jsx"], risk: "low", rollback_plan: "恢复该文件" },
};

test("reads today's Mission and waiting execution approval", () => {
  const snapshot = normalizeDeveloperOSSnapshot({ workspace, plan: basePlan, runState: { status: "idle" } });
  assert.equal(snapshot.mission.title, "接入 Founder");
  assert.equal(snapshot.run.state, "waiting_execution_approval");
  assert.equal(snapshot.actions.approve_execution, true);
});

test("uses authoritative Current Run and restores commit result", () => {
  const plan = {
    ...basePlan, run_id: "run-1", status: "committed",
    commit_result: { commit_hash: "def", commit_message: "feat: founder", branch: "main", committed_files: ["a.jsx"], completed_at: "2026-08-03T00:00:00Z", final_git_status: "" },
  };
  const snapshot = normalizeDeveloperOSSnapshot({ workspace, plan, runState: { run_id: "run-1", status: "committed", updated_at: "2026-08-03T00:00:00Z" } });
  assert.equal(snapshot.run.state, "committed");
  assert.equal(snapshot.commit_result.commit_hash, "def");
  assert.equal(snapshot.commit_result.workspace_clean, true);
  assert.equal(snapshot.actions.approve_commit, false);
});

test("waiting commit shows only contract approval actions", () => {
  const plan = { ...basePlan, run_id: "run-1", status: "waiting_commit_approval", commit_candidate: { id: "candidate-1", changed_files: ["a.jsx"], suggested_message: "feat: founder" }, validation: { passed: true }, review: { passed: true } };
  const snapshot = normalizeDeveloperOSSnapshot({ workspace, plan, runState: { run_id: "run-1", status: "waiting_commit_approval" } });
  assert.equal(snapshot.actions.approve_commit, true);
  assert.equal(snapshot.actions.reject_commit, true);
  assert.equal(snapshot.actions.approve_execution, false);
});

test("failed cancelled and stale never expose illegal approval", () => {
  for (const status of ["failed", "cancelled", "stale"]) {
    const plan = { ...basePlan, run_id: "run-1", status, commit_candidate: { id: "candidate-1" } };
    const snapshot = normalizeDeveloperOSSnapshot({ workspace, plan, runState: { run_id: "run-1", status } });
    assert.equal(snapshot.actions.approve_execution, false);
    assert.equal(snapshot.actions.approve_commit, false);
  }
});

test("approve execution is one idempotent business command", async () => {
  let approvals = 0;
  let release;
  const client = {
    listWorkspaces: async () => [workspace], currentPlan: async () => ({ ...basePlan, run_id: "run-1", status: "executing" }), currentRun: async () => ({ run_id: "run-1", status: "executing" }), execution: async () => ({ ...basePlan, run_id: "run-1", status: "executing" }),
    approveExecution: async () => {
      approvals += 1;
      await new Promise((resolve) => { release = resolve; });
      return { snapshot: { ...basePlan, run_id: "run-1", status: "executing", progress: "正在开发" } };
    },
  };
  const adapter = createFounderDeveloperOSAdapter(client);
  const first = adapter.approve_execution("plan-1");
  const second = adapter.approve_execution("plan-1");
  release();
  await Promise.all([first, second]);
  assert.equal(approvals, 1);
});

test("approve response immediately becomes the executing conversation snapshot", async () => {
  const client = {
    listWorkspaces: async () => [workspace],
    approveExecution: async () => ({
      snapshot: { ...basePlan, run_id: "run-1", status: "executing", progress: "正在开发" },
    }),
  };

  const snapshot = await createFounderDeveloperOSAdapter(client).approve_execution("plan-1");

  assert.equal(snapshot.run.run_id, "run-1");
  assert.equal(snapshot.run.state, "executing");
  assert.equal(snapshot.mission.title, "接入 Founder");
});

test("known Run refresh follows SSOT from executing through testing and failed", async () => {
  const states = [
    { run_id: "run-1", status: "testing", progress: "正在自动测试" },
    { run_id: "run-1", status: "failed", progress: "执行失败", error: "验证未通过" },
  ];
  const client = {
    listWorkspaces: async () => [workspace],
    currentRun: async () => states.shift(),
  };
  const adapter = createFounderDeveloperOSAdapter(client);
  const initial = normalizeDeveloperOSSnapshot({
    workspace, plan: { ...basePlan, run_id: "run-1", status: "executing" },
    runState: { run_id: "run-1", status: "executing" },
  });

  const testing = await adapter.refresh_run(initial);
  const failed = await adapter.refresh_run(testing);

  assert.equal(testing.run.state, "testing");
  assert.equal(failed.run.state, "failed");
  assert.equal(failed.run.failure_summary, "验证未通过");
  assert.equal(failed.mission.title, "接入 Founder");
});

test("refresh restores the same Run and never replaces it with a newer Plan Run", async () => {
  const client = {
    listWorkspaces: async () => [workspace],
    currentRun: async () => ({ run_id: "run-new", status: "executing" }),
  };
  const adapter = createFounderDeveloperOSAdapter(client);
  const oldRun = normalizeDeveloperOSSnapshot({
    workspace, plan: { ...basePlan, plan_id: "plan-old", run_id: "run-old", status: "failed" },
    runState: { run_id: "run-old", status: "failed", error: "旧 Run 失败" },
  });

  const restored = await adapter.refresh_run(oldRun);

  assert.equal(restored, oldRun);
  assert.equal(restored.run.run_id, "run-old");
  assert.equal(restored.run.state, "failed");
});

test("production client uses the Developer Bridge instead of a direct executor endpoint", () => {
  const clientSource = readFileSync(new URL("./developerOSClient.js", import.meta.url), "utf8");
  assert.match(clientSource, /developer\/bridge\/commands/);
  assert.match(clientSource, /command_type: "approve_execution"/);
  assert.match(clientSource, /command_type: "request_today_mission"/);
  assert.doesNotMatch(clientSource, /codex|claude|executor\/start|git commit/i);
});

test("refresh trusts Bridge state and never polls an obsolete execution Plan", async () => {
  let executionReads = 0;
  const client = {
    listWorkspaces: async () => [workspace],
    currentPlan: async () => ({ ...basePlan, run_id: "old-run", status: "stale" }),
    currentRun: async () => ({ run_id: null, status: "idle" }),
    execution: async () => { executionReads += 1; throw Object.assign(new Error("not found"), { status: 404 }); },
  };

  const snapshot = await createFounderDeveloperOSAdapter(client).refresh_state();

  assert.equal(snapshot.run.state, "stale");
  assert.equal(executionReads, 0);
});

test("Founder source has no direct Executor or Git implementation", () => {
  const dashboard = readFileSync(new URL("./FounderDeveloperOSDashboard.jsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../../pages/FounderHome.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(`${dashboard}\n${home}`, /child_process|spawn\(|exec\(|git add|git commit|codex exec|claude/i);
});
