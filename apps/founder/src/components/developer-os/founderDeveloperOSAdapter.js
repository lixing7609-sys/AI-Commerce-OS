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

const TERMINAL = new Set(["committed", "completed", "failed", "cancelled", "commit_rejected", "stale"]);
const COMMIT_BLOCKED = new Set(["failed", "cancelled", "commit_rejected", "stale", "committed", "completed"]);

function unavailable(value) {
  return value === undefined || value === null || value === "" ? "unavailable" : value;
}

function mapState(plan, runState) {
  if (!plan?.run_id) return "waiting_execution_approval";
  const raw = runState?.run_id === plan.run_id ? runState.status : plan.status;
  const aliases = { collecting_artifacts: "artifact_collection", git_candidate: "waiting_commit_approval" };
  const state = aliases[raw] || raw;
  return RUN_LABELS[state] ? state : "failed";
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
  return {
    contract_version: CONTRACT_VERSION,
    command_context: { plan_id: plan?.plan_id || null },
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
      progress: state === "completed" ? 100 : 0,
      epics: [], blockers: summary.blocked_missions || [],
      recommended_mission_id: mission.id || null,
    },
    mission: plan ? {
      mission_id: unavailable(mission.id), title: unavailable(mission.title || plan.mission),
      business_reason: unavailable(summary.why_now), expected_result: unavailable(summary.expected_result),
      risk_level: scope.risk || plan.risk || summary.risk_level || "unavailable",
      dependencies: mission.dependencies || [], target_files: scope.target_files || plan.target_files || [],
      approval_required: state === "waiting_execution_approval", status: state,
    } : null,
    run: plan ? {
      run_id: plan.run_id || null, mission_id: mission.id || null, workspace_id: workspace.id,
      state, progress: typeof plan.progress === "number" ? plan.progress : null,
      current_step: runState?.run_id === plan.run_id ? runState.progress : plan.progress || RUN_LABELS[state],
      started_at: plan.started_at || null, updated_at: runState?.updated_at || null,
      completed_at: plan.finished_at || result?.completed_at || null,
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
      cancel_execution: ["execution_approved", "executing", "testing", "artifact_collection", "reviewing"].includes(state),
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

  async function load() {
    const workspaces = await client.listWorkspaces();
    const workspace = workspaces.find((item) => item.id === WORKSPACE_ID);
    if (!workspace) throw new Error("AI Commerce OS Workspace 未在 Developer OS 白名单中");
    let plan = null;
    try { plan = await client.currentPlan(WORKSPACE_ID); } catch (error) {
      if (error.status !== 404) throw error;
    }
    const runState = await client.currentRun();
    return normalizeDeveloperOSSnapshot({ workspace, plan, runState });
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
    approve_execution: (planId) => guarded(async () => { await client.approveExecution(planId); return load(); }),
    cancel_execution: (planId) => guarded(async () => { await client.cancelExecution(planId); return load(); }),
    request_revision: async () => { throw businessError(new Error("当前 Developer OS 尚未提供版本修改命令")); },
    approve_commit: (planId) => guarded(async () => { await client.approveCommit(planId); return load(); }),
    reject_commit: (planId) => guarded(async () => { await client.rejectCommit(planId); return load(); }),
    open_detailed_report: (snapshot) => snapshot?.raw_report || null,
  };
}
