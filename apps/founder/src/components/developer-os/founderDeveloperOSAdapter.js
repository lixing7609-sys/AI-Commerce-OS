import { developerOSClient } from "./developerOSClient.js";

export const CONTRACT_VERSION = 1;
export const WORKSPACE_ID = "ai-commerce-os";
export const SPRINT = Object.freeze({
  sprint_id: "sprint-1",
  title: "Sprint-1 · Founder 日常研发控制台",
  goal: "让 Founder 每天查看推荐 Mission、授权执行、验收结果并批准提交。",
  status: "active",
});

export const RUN_LABELS = Object.freeze({
  planning: "正在制定方案",
  waiting_execution_approval: "等待执行授权",
  execution_approved: "已批准，准备开发",
  executing: "正在开发",
  testing: "正在自动测试",
  artifact_collection: "正在整理开发成果",
  reviewing: "正在自动验收",
  scope_adjustment: "自动发现范围需要调整",
  replanning: "正在重新规划",
  retrying: "正在继续执行",
  timed_out: "执行超时",
  waiting_commit_approval: "等待提交授权",
  commit_approved: "已批准提交",
  committing: "正在安全提交",
  committed: "已提交",
  completed: "已完成",
  failed: "执行失败",
  cancelled: "已取消",
  commit_rejected: "已拒绝提交",
  stale: "开发成果已过期",
});

const TERMINAL = new Set(["committed", "completed", "failed", "cancelled", "timed_out", "commit_rejected", "stale"]);
const COMMIT_BLOCKED = new Set(["failed", "cancelled", "timed_out", "commit_rejected", "stale", "committed", "completed"]);

function unavailable(value) {
  return value === undefined || value === null || value === "" ? "unavailable" : value;
}

function mapState(plan, runState) {
  if (!plan?.run_id) return "waiting_execution_approval";
  const currentRunId = runState?.current_run_id ?? runState?.run_id;
  const raw = currentRunId === plan.run_id ? runState.status : plan.status;
  const aliases = { collecting_artifacts: "artifact_collection", git_candidate: "waiting_commit_approval" };
  const state = aliases[raw] || raw;
  return RUN_LABELS[state] ? state : "failed";
}

const STOPPED_TIMER_STATES = new Set(["waiting_commit_approval", ...TERMINAL]);

export function runElapsedSeconds(run, now = Date.now()) {
  if (!run?.started_at) return 0;
  const end = STOPPED_TIMER_STATES.has(run.state) && run.completed_at ? Date.parse(run.completed_at) : now;
  return Math.max(0, Math.floor((end - Date.parse(run.started_at)) / 1000));
}

export function formatRunElapsed(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const values = hours ? [hours, minutes, rest] : [minutes, rest];
  return values.map((value) => String(value).padStart(2, "0")).join(":");
}

export function runHeartbeatStale(run, now = Date.now()) {
  return Boolean(
    run?.last_heartbeat_at && !STOPPED_TIMER_STATES.has(run.state)
    && now - Date.parse(run.last_heartbeat_at) > 60000
  );
}

export function normalizeDeveloperOSSnapshot({ workspace, plan, runState }) {
  if (!workspace) throw new Error("研发 Workspace 当前不可用");
  const state = plan ? mapState(plan, runState) : "planning";
  const mission = plan?.mission || {};
  const summary = plan?.summary || {};
  const scope = plan?.execution_scope || {};
  const candidate = plan?.commit_candidate || null;
  const result = plan?.commit_result || null;
  const validation = plan?.validation || null;
  const review = plan?.review || null;
  const artifacts = plan?.artifacts || null;
  const roadmapMissions = Array.isArray(plan?.roadmap_missions) ? plan.roadmap_missions : [];
  const recentRuns = Array.isArray(plan?.recent_runs) ? plan.recent_runs : [];
  const recentGitCommits = Array.isArray(plan?.recent_git_commits) ? plan.recent_git_commits : [];
  const missionHistory = roadmapMissions.map((item) => ({
    mission_id: item.mission_id || item.id,
    title: item.title,
    priority: item.priority,
    dependencies: item.dependencies || [],
    status: item.status,
  }));
  if (mission?.id && !missionHistory.some((item) => item.mission_id === mission.id)) {
    missionHistory.push({
      mission_id: mission.id, title: mission.title, priority: mission.priority || 0,
      dependencies: mission.dependencies || [], status: state,
    });
  }
  const completedMissions = missionHistory.filter((item) => ["completed", "committed"].includes(item.status));
  const activeMissions = missionHistory.filter((item) => ["in_progress", "waiting_execution_approval", "waiting_commit_approval"].includes(item.status));
  const blockedMissions = missionHistory.filter((item) => ["blocked", "failed", "cancelled", "stale", "timed_out", "commit_rejected"].includes(item.status));
  const currentRunId = runState?.current_run_id ?? runState?.run_id ?? null;
  return {
    contract_version: CONTRACT_VERSION,
    command_context: {
      plan_id: plan?.plan_id || null,
      approval_id: plan?.approval_id || null,
      baseline: plan?.workspace?.baseline || plan?.approval_baseline || null,
    },
    workspace: {
      workspace_id: workspace.id,
      name: unavailable(workspace.name),
      path: unavailable(workspace.path),
      branch: unavailable(workspace.branch),
      head: unavailable(workspace.baseline),
      clean: !workspace.dirty,
      last_checked_at: new Date().toISOString(),
    },
    sprint: {
      ...SPRINT,
      total_missions: missionHistory.length || undefined,
      completed_missions: completedMissions.length,
      in_progress_missions: activeMissions.length,
      blocked_missions: blockedMissions,
      progress: missionHistory.length ? Math.round((completedMissions.length / missionHistory.length) * 100) : 0,
      missions: missionHistory,
      epics: [], blockers: blockedMissions,
      recommended_mission_id: mission.id || null,
    },
    daily_briefing: {
      recent_completed_missions: completedMissions.slice(-5).reverse(),
      recent_runs: recentRuns,
      recent_git_commits: recentGitCommits,
      latest_completed_run: recentRuns.find((item) => ["completed", "committed", "waiting_commit_approval"].includes(item.status)) || null,
      latest_build: recentRuns.find((item) => item.validation?.build)?.validation?.build || null,
      latest_tests: recentRuns.find((item) => item.validation?.tests)?.validation?.tests || null,
      decisions: [
        ...activeMissions.filter((item) => item.status === "waiting_execution_approval").map((item) => ({ type: "execution", mission_id: item.mission_id, title: item.title })),
        ...activeMissions.filter((item) => item.status === "waiting_commit_approval").map((item) => ({ type: "commit", mission_id: item.mission_id, title: item.title })),
        ...blockedMissions.filter((item) => ["failed", "timed_out", "commit_rejected"].includes(item.status)).map((item) => ({ type: "retry_or_rollback", mission_id: item.mission_id, title: item.title, status: item.status })),
      ],
    },
    mission: plan ? {
      mission_id: unavailable(mission.id), title: unavailable(mission.title || plan.mission),
      business_reason: unavailable(summary.why_now), expected_result: unavailable(summary.expected_result),
      risk_level: scope.risk || plan.risk || summary.risk_level || "unavailable",
      dependencies: mission.dependencies || [], target_files: scope.target_files || plan.target_files || [],
      approval_required: state === "waiting_execution_approval", status: state,
    } : null,
    run: plan ? {
      run_id: plan.run_id || null, current_run_id: currentRunId,
      mission_id: mission.id || null, goal_id: plan.goal_id || null,
      plan_id: plan.plan_id || null, approval_id: plan.approval_id || null, workspace_id: workspace.id,
      state, progress: typeof plan.progress === "number" ? plan.progress : null,
      current_step: currentRunId === plan.run_id ? runState.current_step || runState.progress : plan.progress || RUN_LABELS[state],
      started_at: currentRunId === plan.run_id ? runState.started_at : plan.started_at || null,
      updated_at: currentRunId === plan.run_id ? runState.updated_at : plan.updated_at || null,
      last_heartbeat_at: currentRunId === plan.run_id ? runState.last_heartbeat_at : plan.last_heartbeat_at || null,
      current_step_started_at: currentRunId === plan.run_id ? runState.current_step_started_at : plan.current_step_started_at || null,
      timeout_seconds: currentRunId === plan.run_id ? runState.timeout_seconds : plan.timeout_seconds || null,
      completed_at: currentRunId === plan.run_id ? runState.finished_at : plan.finished_at || result?.completed_at || null,
      failure_summary: plan.error || runState?.error || null,
    } : null,
    artifact: artifacts || validation || review ? {
      changed_files: artifacts?.changed_files || validation?.changed_files || [],
      diff_summary: artifacts?.git_diff_summary || candidate?.diff_summary || "unavailable",
      tests: validation?.tests || "unavailable", lint: validation?.lint || "unavailable",
      build: validation?.build || "unavailable", screenshots: artifacts?.screenshots || [],
      review_result: review?.passed === true ? "passed" : review?.passed === false ? "failed" : "pending",
      rollback_plan: plan.rollback_plan || artifacts?.rollback_plan || scope.rollback_plan || "unavailable",
      recommend_commit: review?.recommend_commit === true,
    } : null,
    candidate: candidate ? {
      candidate_id: candidate.id, workspace_id: workspace.id, baseline: candidate.baseline,
      branch: candidate.branch, files: candidate.changed_files || [], diff_summary: candidate.diff_summary,
      suggested_commit_message: candidate.suggested_message,
      review_status: review?.passed ? "passed" : "failed",
      verification_status: validation?.passed ? "passed" : "failed",
      risk_level: plan.risk || "low", status: state,
    } : null,
    commit_result: result ? {
      commit_hash: result.commit_hash, commit_message: result.commit_message, branch: result.branch,
      committed_files: result.committed_files || [], completed_at: result.completed_at,
      workspace_clean: !result.final_git_status,
    } : null,
    actions: {
      approve_execution: state === "waiting_execution_approval",
      cancel_execution: ["execution_approved", "preparing", "running", "executing", "testing", "artifact_collection", "reviewing", "retrying"].includes(state),
      request_revision: ["reviewing", "waiting_commit_approval", "commit_rejected", "failed", "stale"].includes(state),
      approve_commit: state === "waiting_commit_approval" && Boolean(candidate) && !COMMIT_BLOCKED.has(state),
      reject_commit: state === "waiting_commit_approval" && Boolean(candidate),
      terminal: TERMINAL.has(state),
    },
    raw_report: { plan, run_state: runState },
  };
}

function businessError(error) {
  return {
    code: error.code || "developer_os_unavailable",
    message: "当前暂时无法连接研发服务",
    impact: "已完成的开发成果不会因此丢失或被修改。",
    suggestion: error.status === 404 ? "当前没有可恢复的 Mission，请获取今日建议。" : "请稍后刷新状态。",
    detail: error.message,
  };
}

export function createFounderDeveloperOSAdapter(client = developerOSClient) {
  let inFlight = null;

  async function workspace() {
    const workspaces = await client.listWorkspaces();
    const selected = workspaces.find((item) => item.id === WORKSPACE_ID);
    if (!selected) throw new Error("AI Commerce OS Workspace 未在 Developer OS 白名单中");
    return selected;
  }

  async function load() {
    const selectedWorkspace = await workspace();
    let plan = null;
    try { plan = await client.currentPlan(WORKSPACE_ID); } catch (error) {
      if (error.status !== 404) throw error;
    }
    const runState = await client.currentRun();
    return normalizeDeveloperOSSnapshot({ workspace: selectedWorkspace, plan, runState });
  }

  async function guarded(action) {
    if (inFlight) return inFlight;
    inFlight = action().finally(() => { inFlight = null; });
    return inFlight;
  }

  return {
    refresh_state: async () => { try { return await load(); } catch (error) { throw businessError(error); } },
    request_today_mission: (goal = SPRINT.goal) => guarded(async () => {
      await client.selectWorkspace(WORKSPACE_ID);
      await client.requestMission(WORKSPACE_ID, goal);
      return load();
    }),
    approve_execution: (planId, approvalId) => guarded(async () => {
      const response = await client.approveExecution(planId, approvalId);
      const plan = response?.snapshot;
      if (!plan) throw new Error("Developer OS 未返回可恢复的 Mission");
      if (!plan.run_id && (
        plan.mission_version_changed || plan.baseline_refreshed || plan.approval_version_changed
      )) {
        return normalizeDeveloperOSSnapshot({
          workspace: await workspace(), plan, runState: { status: "idle" },
        });
      }
      if (!plan.run_id) throw new Error("Developer OS 未返回可恢复的 Run");
      return normalizeDeveloperOSSnapshot({
        workspace: await workspace(),
        plan,
        runState: {
          run_id: plan.run_id, status: plan.status, progress: plan.progress,
          updated_at: plan.updated_at || null, error: plan.error || null,
        },
      });
    }),
    refresh_mission: async () => load(),
    refresh_run: async (snapshot) => {
      const expectedRunId = snapshot?.run?.run_id;
      const expectedPlanId = snapshot?.command_context?.plan_id;
      if (!expectedRunId || !expectedPlanId) return snapshot;
      const runState = await client.currentRun();
      if (runState?.run_id !== expectedRunId) return snapshot;
      const plan = await client.currentPlan(WORKSPACE_ID);
      if (plan?.plan_id !== expectedPlanId || plan?.run_id !== expectedRunId) return snapshot;
      return normalizeDeveloperOSSnapshot({ workspace: await workspace(), plan, runState });
    },
    cancel_execution: (planId) => guarded(async () => { await client.cancelExecution(planId); return load(); }),
    request_revision: async () => { throw businessError(new Error("当前 Developer OS 尚未提供版本修改命令")); },
    revise_commit_message: async (planId, suggestedMessage) => {
      const response = await client.reviseCommitMessage(planId, suggestedMessage);
      const plan = response?.snapshot;
      if (!plan) throw new Error("Developer OS 未返回更新后的 Commit Candidate");
      return normalizeDeveloperOSSnapshot({
        workspace: await workspace(),
        plan,
        runState: await client.currentRun(),
      });
    },
    approve_commit: (planId) => guarded(async () => { await client.approveCommit(planId); return load(); }),
    reject_commit: (planId) => guarded(async () => { await client.rejectCommit(planId); return load(); }),
    open_detailed_report: (snapshot) => snapshot?.raw_report || null,
  };
}
