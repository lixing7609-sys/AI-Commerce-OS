import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createFounderDeveloperOSAdapter, formatRunElapsed, normalizeDeveloperOSSnapshot, runElapsedSeconds, runHeartbeatStale } from "./founderDeveloperOSAdapter.js";

const workspace = { id: "ai-commerce-os", name: "AI Commerce OS", path: "/approved/workspace", branch: "main", baseline: "abc", dirty: false };
const basePlan = {
  plan_id: "plan-1", workspace_id: "ai-commerce-os",
  mission: { id: "mission-1", title: "接入 Founder", dependencies: [] },
  summary: { why_now: "今天最有价值", expected_result: "形成日常入口", risk_level: "low", blocked_missions: [] },
  execution_scope: { target_files: ["apps/founder/src/pages/FounderHome.jsx"], risk: "low", rollback_plan: "恢复该文件" },
};

test("reads today's Mission and waiting execution approval", () => {
  const snapshot = normalizeDeveloperOSSnapshot({ workspace, plan: basePlan, runState: { current_run_id: null, status: "idle" } });
  assert.equal(snapshot.mission.title, "接入 Founder");
  assert.equal(snapshot.run.state, "waiting_execution_approval");
  assert.equal(snapshot.actions.approve_execution, true);
});

test("old failed Run never overrides a new waiting Mission", () => {
  const snapshot = normalizeDeveloperOSSnapshot({
    workspace, plan: { ...basePlan, plan_id: "plan-new", run_id: null },
    runState: { current_run_id: "run-old", run_id: "run-old", plan_id: "plan-old", status: "failed" },
  });
  assert.equal(snapshot.run.run_id, null);
  assert.equal(snapshot.run.state, "waiting_execution_approval");
  assert.equal(snapshot.actions.approve_execution, true);
});

test("timer restores from started_at and heartbeat becomes stale after 60 seconds", () => {
  const run = {
    state: "executing", started_at: "2026-08-04T00:00:00.000Z",
    last_heartbeat_at: "2026-08-04T00:00:30.000Z",
  };
  assert.equal(runElapsedSeconds(run, Date.parse("2026-08-04T00:01:05.000Z")), 65);
  assert.equal(formatRunElapsed(65), "01:05");
  assert.equal(formatRunElapsed(3661), "01:01:01");
  assert.equal(runHeartbeatStale(run, Date.parse("2026-08-04T00:01:31.000Z")), true);
  assert.equal(runHeartbeatStale(run, Date.parse("2026-08-04T00:01:29.000Z")), false);
});

test("waiting commit and cancelled stop elapsed timer at completed_at", () => {
  for (const state of ["waiting_commit_approval", "cancelled", "timed_out"]) {
    const run = {
      state, started_at: "2026-08-04T00:00:00.000Z", completed_at: "2026-08-04T00:02:00.000Z",
    };
    assert.equal(runElapsedSeconds(run, Date.parse("2026-08-04T01:00:00.000Z")), 120);
  }
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
  assert.equal(snapshot.candidate.suggested_commit_message, "feat: founder");
});

test("approve commit is idempotent and calls the existing client once", async () => {
  let approvals = 0;
  let release;
  const committedPlan = {
    ...basePlan, run_id: "run-1", status: "committed",
    commit_result: { commit_hash: "abc", commit_message: "feat: founder", branch: "main", committed_files: ["a.jsx"], final_git_status: "" },
  };
  const client = {
    approveCommit: async () => {
      approvals += 1;
      await new Promise((resolve) => { release = resolve; });
    },
    listWorkspaces: async () => [workspace],
    currentPlan: async () => committedPlan,
    currentRun: async () => ({ run_id: "run-1", status: "committed" }),
  };
  const adapter = createFounderDeveloperOSAdapter(client);
  const first = adapter.approve_commit("plan-1");
  const second = adapter.approve_commit("plan-1");
  release();
  const [snapshot] = await Promise.all([first, second]);
  assert.equal(approvals, 1);
  assert.equal(snapshot.commit_result.commit_hash, "abc");
});

test("reject commit returns the authoritative rejected state", async () => {
  let rejects = 0;
  const client = {
    rejectCommit: async () => { rejects += 1; },
    listWorkspaces: async () => [workspace],
    currentPlan: async () => ({ ...basePlan, run_id: "run-1", status: "commit_rejected" }),
    currentRun: async () => ({ run_id: "run-1", status: "commit_rejected" }),
  };
  const snapshot = await createFounderDeveloperOSAdapter(client).reject_commit("plan-1");
  assert.equal(rejects, 1);
  assert.equal(snapshot.run.state, "commit_rejected");
  assert.equal(snapshot.actions.approve_commit, false);
});

test("refresh restores the same Commit Candidate and committed result from the real Plan", async () => {
  const candidate = { id: "candidate-1", changed_files: ["a.jsx"], suggested_message: "feat: founder" };
  const client = {
    listWorkspaces: async () => [workspace],
    currentPlan: async () => ({ ...basePlan, run_id: "run-1", status: "waiting_commit_approval", commit_candidate: candidate, validation: { passed: true }, review: { passed: true } }),
    currentRun: async () => ({ run_id: "run-1", status: "waiting_commit_approval" }),
  };
  const initial = normalizeDeveloperOSSnapshot({
    workspace,
    plan: { ...basePlan, run_id: "run-1", status: "reviewing" },
    runState: { run_id: "run-1", status: "reviewing" },
  });
  const restored = await createFounderDeveloperOSAdapter(client).refresh_run(initial);
  assert.equal(restored.run.state, "waiting_commit_approval");
  assert.equal(restored.candidate.candidate_id, "candidate-1");
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

test("Mission Version Changed automatically returns and renders the latest Mission", async () => {
  const client = {
    listWorkspaces: async () => [workspace],
    approveExecution: async () => ({
      snapshot: {
        ...basePlan, plan_id: "plan-new", run_id: null,
        mission_version_changed: true,
        mission: { id: "mission-new", title: "新的 Founder Mission", status: "waiting_execution_approval" },
      },
    }),
  };

  const snapshot = await createFounderDeveloperOSAdapter(client).approve_execution("plan-old");

  assert.equal(snapshot.command_context.plan_id, "plan-new");
  assert.equal(snapshot.mission.title, "新的 Founder Mission");
  assert.equal(snapshot.run.state, "waiting_execution_approval");
});

test("baseline refresh replaces Plan and Approval binding before another approval", async () => {
  let submitted = null;
  const client = {
    listWorkspaces: async () => [workspace],
    approveExecution: async (planId, approvalId) => {
      submitted = { planId, approvalId };
      return {
        snapshot: {
          ...basePlan, plan_id: "plan-new", approval_id: "approval-new", run_id: null,
          baseline_refreshed: true,
          workspace: { baseline: "head-new" },
          mission: { id: "mission-new", title: "最新 Mission", status: "waiting_execution_approval" },
        },
      };
    },
  };

  const snapshot = await createFounderDeveloperOSAdapter(client).approve_execution("plan-old", "approval-old");

  assert.deepEqual(submitted, { planId: "plan-old", approvalId: "approval-old" });
  assert.equal(snapshot.command_context.plan_id, "plan-new");
  assert.equal(snapshot.command_context.approval_id, "approval-new");
  assert.equal(snapshot.command_context.baseline, "head-new");
  assert.equal(snapshot.run.state, "waiting_execution_approval");
});

test("waiting approval refresh automatically replaces old Mission with latest version", async () => {
  const client = {
    listWorkspaces: async () => [workspace],
    currentPlan: async () => ({
      ...basePlan, plan_id: "plan-new",
      mission: { id: "mission-new", title: "最新 Mission", status: "waiting_execution_approval" },
    }),
    currentRun: async () => ({ status: "idle" }),
  };

  const snapshot = await createFounderDeveloperOSAdapter(client).refresh_mission();

  assert.equal(snapshot.command_context.plan_id, "plan-new");
  assert.equal(snapshot.mission.title, "最新 Mission");
});

test("known Run refresh follows SSOT from executing through testing and failed", async () => {
  const states = [
    { run_id: "run-1", status: "testing", progress: "正在自动测试" },
    { run_id: "run-1", status: "failed", progress: "执行失败", error: "验证未通过" },
  ];
  const client = {
    listWorkspaces: async () => [workspace],
    currentPlan: async () => ({ ...basePlan, run_id: "run-1", status: states[0]?.status || "failed", error: states[0]?.error || null }),
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

test("daily briefing exposes real sprint missions, decisions, and progress", () => {
  const snapshot = normalizeDeveloperOSSnapshot({
    workspace,
    plan: {
      ...basePlan,
      roadmap_missions: [
        { mission_id: "mission-done", title: "已完成入口", priority: 10, status: "completed" },
        { mission_id: "mission-next", title: "今日推进项", priority: 20, status: "waiting_execution_approval" },
        { mission_id: "mission-blocked", title: "被阻塞项", priority: 30, status: "blocked" },
      ],
      recent_runs: [{ run_id: "run-done", status: "completed", validation: { tests: "passed", build: "passed" } }],
      recent_git_commits: [{ commit_hash: "abc123", commit_message: "feat: daily briefing", completed_at: "2026-08-03T00:00:00Z" }],
    },
    runState: { current_run_id: null, status: "idle" },
  });
  assert.equal(snapshot.sprint.total_missions, 4); // current mission is retained alongside the roadmap history
  assert.equal(snapshot.sprint.completed_missions, 1);
  assert.equal(snapshot.sprint.blocked_missions.length, 1);
  assert.equal(snapshot.daily_briefing.decisions[0].type, "execution");
  assert.equal(snapshot.daily_briefing.latest_completed_run.run_id, "run-done");
  assert.equal(snapshot.daily_briefing.recent_git_commits[0].commit_hash, "abc123");
});

test("empty roadmap produces an explicit empty briefing without mock missions", () => {
  const snapshot = normalizeDeveloperOSSnapshot({
    workspace,
    plan: null,
    runState: { current_run_id: null, status: "idle" },
  });
  assert.deepEqual(snapshot.sprint.missions, []);
  assert.deepEqual(snapshot.daily_briefing.recent_completed_missions, []);
  assert.deepEqual(snapshot.daily_briefing.decisions, []);
});

test("Founder adapter sends conversation_id for plan, run, and goal commands", async () => {
  const calls = [];
  const client = {
    listWorkspaces: async () => [workspace],
    currentPlan: async (...args) => { calls.push(["plan", ...args]); return { ...basePlan, conversation_id: "conversation-b" }; },
    currentRun: async (...args) => { calls.push(["run", ...args]); return { current_run_id: null, status: "idle" }; },
    selectWorkspace: async () => {},
    requestMission: async (...args) => { calls.push(["mission", ...args]); },
  };
  const adapter = createFounderDeveloperOSAdapter(client, { conversationId: "conversation-b" });
  await adapter.refresh_state();
  await adapter.request_today_mission("把 Sino 升级为 AI COO");
  assert.ok(calls.some(([kind, workspaceId, conversationId]) => kind === "plan" && workspaceId === "ai-commerce-os" && conversationId === "conversation-b"));
  assert.ok(calls.some(([kind, workspaceId, conversationId]) => kind === "run" && workspaceId === "ai-commerce-os" && conversationId === "conversation-b"));
  assert.ok(calls.some(([kind, workspaceId, goal, conversationId]) => kind === "mission" && workspaceId === "ai-commerce-os" && goal.includes("AI COO") && conversationId === "conversation-b"));
});

test("conversation briefing is scoped to the active conversation", () => {
  const source = readFileSync(new URL("../founder-ai/FounderConversation.jsx", import.meta.url), "utf8");
  assert.match(source, /createFounderDeveloperOSAdapter\(undefined, \{ conversationId \}\)/);
  assert.match(source, /<DailyBriefing compact conversationId=\{conversation\.id\} \/>/);
});

test("FounderHome publishes the selected conversation as Developer OS active state", () => {
  const home = readFileSync(new URL("../../pages/FounderHome.jsx", import.meta.url), "utf8");
  assert.match(home, /setActiveConversation\("ai-commerce-os", activeConversationId \|\| null\)/);
  assert.match(home, /\[activeConversationId\]/);
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
