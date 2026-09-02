// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchitectureProposalCard, ConversationThread, normalizeDisplayText, normalizeTextList } from "./ConversationThread.jsx";

const snapshot = (id, messages) => ({ conversation: { id }, messages });
afterEach(() => cleanup());

describe("ConversationThread layout", () => {
  // Legacy workspace-card assertions are intentionally skipped below where the
  // Conversation-first ownership contract removed those controls from center.
  it("exposes exactly one selected discussion mode and keeps it aligned with mode changes", () => {
    const onModeChange = vi.fn();
    const value = snapshot("mode-selection", []);
    const props = { snapshot: value, message: "", onMessage: vi.fn(), onSend: vi.fn(), busy: false, onModeChange };
    const { rerender } = render(<ConversationThread {...props} mode="sino" />);
    const selectedModes = () => screen.getAllByRole("button").filter((button) => button.getAttribute("aria-pressed") === "true");
    const assertSelected = (name, modeValue) => {
      expect(selectedModes()).toHaveLength(1);
      const selected = screen.getByRole("button", { name });
      expect(selected.getAttribute("aria-pressed")).toBe("true");
      expect(selected.dataset.mode).toBe(modeValue);
      expect(selected.classList.contains("is-active")).toBe(true);
    };

    expect(screen.getByRole("group", { name: "讨论模式" })).toBeTruthy();
    assertSelected("Sino", "sino");

    fireEvent.click(screen.getByRole("button", { name: "多模型讨论" }));
    expect(onModeChange).toHaveBeenLastCalledWith("council");
    rerender(<ConversationThread {...props} mode="council" />);
    assertSelected("多模型讨论", "council");
    expect(screen.getByRole("button", { name: "Sino" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "自动多轮" }));
    expect(onModeChange).toHaveBeenLastCalledWith("auto");
    rerender(<ConversationThread {...props} mode="auto" />);
    assertSelected("自动多轮", "auto");
    expect(screen.getByRole("button", { name: "多模型讨论" }).getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "Sino" }));
    expect(onModeChange).toHaveBeenLastCalledWith("sino");
  });

  it("keeps an Architecture task in Conversation and leaves its action to the right rail", () => {
    const route = { classification: "STRATEGIC_TASK", task_type: "ARCHITECTURE_TASK", current_step: "decision_readiness", architecture_proposal: { proposal_id: "proposal-v1", proposal_version: 1, status: "ready_for_founder_decision", current_problem: "Boundary unclear", proposed_boundary: "Founder owns definitions; Studio consumes Ready references.", founder_responsibilities: ["Validate"], studio_responsibilities: ["Execute Ready"], capability_lifecycle: ["candidate", "ready"], binding_contract: { reference: "id + version", consumer_rule: "ready_only" }, learning_feedback: "Return evidence", migration_impact: ["Preserve IDs"], risks: ["Drift"], recommended_decision: "Approve boundary" } };
    const value = { ...snapshot("conv-architecture", [{ message_id: "m1", role: "founder", content: "重新设计 Founder 与 Studio Capability 供给关系" }]), sino_brain: { stage: "decision_ready", active_workspace_stage: "decision_readiness", source_message_refs: ["m1"], stage_workspaces: [{ stage_key: "decision_readiness", label: "Decision Readiness", status: "active", message_refs: ["m1"] }], discovery: { task_complexity_route: route }, current_action: { title: "等待 Founder 决策", primary_label: null } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("重新设计 Founder 与 Studio Capability 供给关系")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Architecture Proposal" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Standard Task 流程" })).toBeNull();
  });

  it("shows low-risk operational runtime states in the same conversation", () => {
    const value = {
      ...snapshot("conv-operational", [{ message_id: "m1", role: "founder", content: "检查当前工程状态" }]),
      sino_brain: {
        discovery: {
          operational_runtime: {
            status: "queued",
            message: "这是一个低风险本地开发检查，我会直接执行。正在准备执行…",
            task_id: "task-operational",
            execution_id: "execution-operational",
            risk_decision: { risk_level: "LOW" },
          },
        },
      },
    };
    const { rerender } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("complementary", { name: "Operational Runtime Status" })).toBeTruthy();
    expect(screen.getByText("正在准备执行…")).toBeTruthy();

    rerender(<ConversationThread snapshot={{ ...value, sino_brain: { discovery: { operational_runtime: { ...value.sino_brain.discovery.operational_runtime, status: "running", message: "正在执行…" } } } }} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getAllByText("正在执行…").length).toBeGreaterThan(0);

    rerender(<ConversationThread snapshot={{ ...value, sino_brain: { discovery: { operational_runtime: { ...value.sino_brain.discovery.operational_runtime, status: "completed", result: { summary: "当前 branch：feature/sino-operational-runtime-v1", result: { branch: "feature/sino-operational-runtime-v1", head: "head-test", working_tree_clean: true } } } } } }} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("执行完成")).toBeTruthy();
    expect(screen.getByText("feature/sino-operational-runtime-v1")).toBeTruthy();
    expect(screen.getByText("head-test")).toBeTruthy();
    expect(screen.getByText("clean")).toBeTruthy();
  });

  it("shows operational failure and retryability in the same conversation", () => {
    const value = {
      ...snapshot("conv-operational-failed", [{ message_id: "m1", role: "founder", content: "检查当前工程状态" }]),
      sino_brain: { discovery: { operational_runtime: { status: "failed", error: "git unavailable", retryable: true, task_id: "task-failed", execution_id: "execution-failed" } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("执行失败")).toBeTruthy();
    expect(screen.getByText("git unavailable")).toBeTruthy();
    expect(screen.getByText("YES")).toBeTruthy();
  });

  it("shows focused test execution result in the same conversation", () => {
    const value = {
      ...snapshot("conv-focused", [{ message_id: "m1", role: "founder", content: "运行测试" }]),
      sino_brain: {
        discovery: {
          operational_runtime: {
            status: "completed",
            task_id: "task-focused",
            execution_id: "execution-focused",
            result: {
              operation_type: "FOCUSED_TEST",
              check_result: "PASS",
              summary: "测试完成：7 passed，0 failed，0 errors。",
              result: { operation_type: "FOCUSED_TEST", passed: 7, failed: 0, errors: 0, exit_code: 0 },
            },
          },
        },
      },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("FOCUSED_TEST")).toBeTruthy();
    expect(screen.getByText("PASS")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
    expect(screen.getByText("测试完成：7 passed，0 failed，0 errors。")).toBeTruthy();
  });

  it("shows frontend build PASS and FAIL results", () => {
    const pass = {
      ...snapshot("conv-build", [{ message_id: "m1", role: "founder", content: "检查前端构建" }]),
      sino_brain: { discovery: { operational_runtime: { status: "completed", task_id: "task-build", execution_id: "execution-build", result: { operation_type: "FRONTEND_BUILD", check_result: "PASS", summary: "Frontend build PASS。", result: { operation_type: "FRONTEND_BUILD", exit_code: 0 } } } } },
    };
    const { rerender } = render(<ConversationThread snapshot={pass} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("FRONTEND_BUILD")).toBeTruthy();
    expect(screen.getByText("PASS")).toBeTruthy();
    rerender(<ConversationThread snapshot={{ ...pass, sino_brain: { discovery: { operational_runtime: { ...pass.sino_brain.discovery.operational_runtime, result: { operation_type: "FRONTEND_BUILD", check_result: "FAIL", summary: "Frontend build FAIL。", result: { operation_type: "FRONTEND_BUILD", exit_code: 1 } } } } } }} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("FAIL")).toBeTruthy();
  });

  it("shows bounded code change result, changed files and verification state", () => {
    const value = {
      ...snapshot("conv-bounded", [{ message_id: "m1", role: "founder", content: "修改状态卡标题" }]),
      sino_brain: { discovery: { operational_runtime: { status: "completed", task_id: "task-bounded", execution_id: "execution-bounded", result: {
        operation_type: "BOUNDED_CODE_CHANGE",
        check_result: "PASS",
        summary: "受控代码修改完成，验证通过。",
        changed_files: ["frontend/src/sino-founder/ConversationThread.jsx"],
        boundary_check: "PASS",
        build_status: "PASS",
        working_tree_status: "dirty",
        checkpoint: {
          commit_message: "fix(sino-runtime): align controlled runtime status label",
          commit_file_count: 1,
          new_head: "head-checkpoint",
        },
        result: { operation_type: "BOUNDED_CODE_CHANGE", tests_passed: 3, tests_failed: 0, working_tree_clean: false },
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("BOUNDED_CODE_CHANGE")).toBeTruthy();
    expect(screen.getByText("frontend/src/sino-founder/ConversationThread.jsx")).toBeTruthy();
    expect(screen.getByText("Boundary check")).toBeTruthy();
    expect(screen.getAllByText("PASS").length).toBeGreaterThan(0);
    expect(screen.getByText("fix(sino-runtime): align controlled runtime status label")).toBeTruthy();
    expect(screen.getByText("head-checkpoint")).toBeTruthy();
    expect(screen.getAllByText("dirty").length).toBeGreaterThan(0);
  });

  it("shows bounded code change boundary violation in the same conversation", () => {
    const value = {
      ...snapshot("conv-boundary", [{ message_id: "m1", role: "founder", content: "修改状态卡标题" }]),
      sino_brain: { discovery: { operational_runtime: { status: "failed", task_id: "task-boundary", execution_id: "execution-boundary", result: {
        operation_type: "BOUNDED_CODE_CHANGE",
        check_result: "FAILED_BOUNDARY",
        summary: "检测到超出授权范围的修改，已停止。",
        changed_files: ["backend/app/secret.py"],
        boundary_check: "FAILED_BOUNDARY",
        checkpoint: { failure_type: "BOUNDARY_VIOLATION" },
        working_tree_status: "dirty",
        result: { operation_type: "BOUNDED_CODE_CHANGE", changed_files: ["backend/app/secret.py"] },
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("执行失败")).toBeTruthy();
    expect(screen.getAllByText("FAILED_BOUNDARY").length).toBeGreaterThan(0);
    expect(screen.getByText("BOUNDARY_VIOLATION")).toBeTruthy();
    expect(screen.getByText("backend/app/secret.py")).toBeTruthy();
  });

  it("shows Codex-backed bounded change status without raw copy-paste instructions", () => {
    const value = {
      ...snapshot("conv-codex-change", [{ message_id: "m1", role: "founder", content: "把 Codex Bridge E2E fixture 改成 CODEX_BRIDGE_OK" }]),
      sino_brain: { discovery: { operational_runtime: {
        status: "running",
        message: "Sino 正在通过 Codex 处理授权范围内的代码修改…",
        task_id: "task-codex",
        execution_id: "execution-codex",
        operation_type: "BOUNDED_CODE_CHANGE",
        risk_decision: { risk_level: "MEDIUM" },
        result: { operation_type: "BOUNDED_CODE_CHANGE", real_executor_used: "CODEX_EXECUTOR" },
      } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("CODEX_EXECUTOR")).toBeTruthy();
    expect(screen.getByText("Sino is using Codex for the approved code change.")).toBeTruthy();
    expect(screen.queryByText(/复制.*Codex|copy.*Codex|codex exec/iu)).toBeNull();
  });

  it("shows safe push success details in the same conversation", () => {
    const value = {
      ...snapshot("conv-safe-push", [{ message_id: "m1", role: "founder", content: "推送当前 checkpoint" }]),
      sino_brain: { discovery: { operational_runtime: { status: "completed", task_id: "task-push", execution_id: "execution-push", operation_type: "SAFE_PUSH", result: {
        operation_type: "SAFE_PUSH",
        summary: "安全推送完成：feature/sino-safe-push-v1 → origin/feature/sino-safe-push-v1",
        local_branch: "feature/sino-safe-push-v1",
        local_head: "head-local",
        remote_name: "origin",
        remote_branch: "feature/sino-safe-push-v1",
        new_remote_head: "head-local",
        ahead_before: 1,
        behind_before: 0,
        push_performed: true,
        already_up_to_date: false,
        force_used: false,
        tags_pushed: false,
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("SAFE_PUSH")).toBeTruthy();
    expect(screen.getAllByText("feature/sino-safe-push-v1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("head-local").length).toBeGreaterThan(0);
    expect(screen.getByText("origin")).toBeTruthy();
    expect(screen.getByText("Remote HEAD")).toBeTruthy();
    expect(screen.getByText("Commits pushed")).toBeTruthy();
    expect(screen.getByText("Tags pushed")).toBeTruthy();
    expect(screen.getAllByText("NO").length).toBeGreaterThan(0);
  });

  it("shows safe push blocked reason in the same conversation", () => {
    const value = {
      ...snapshot("conv-safe-push-blocked", [{ message_id: "m1", role: "founder", content: "推送当前 checkpoint" }]),
      sino_brain: { discovery: { operational_runtime: { status: "failed", task_id: "task-push", execution_id: "execution-push", operation_type: "SAFE_PUSH", result: {
        operation_type: "SAFE_PUSH",
        summary: "remote branch is ahead",
        failure_type: "REMOTE_AHEAD_BLOCKED",
        local_branch: "feature/sino-safe-push-v1",
        local_head: "head-local",
        remote_name: "origin",
        remote_branch: "feature/sino-safe-push-v1",
        ahead_before: 0,
        behind_before: 1,
        push_performed: false,
        force_used: false,
        tags_pushed: false,
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("执行失败")).toBeTruthy();
    expect(screen.getByText("REMOTE_AHEAD_BLOCKED")).toBeTruthy();
    expect(screen.getByText("remote branch is ahead")).toBeTruthy();
    expect(screen.getAllByText("feature/sino-safe-push-v1").length).toBeGreaterThan(0);
  });

  it("shows safe merge success details and no target push in the same conversation", () => {
    const value = {
      ...snapshot("conv-safe-merge", [{ message_id: "m1", role: "founder", content: "合并 feature 到 integration" }]),
      sino_brain: { discovery: { operational_runtime: { status: "completed", task_id: "task-merge", execution_id: "execution-merge", operation_type: "SAFE_MERGE", result: {
        operation_type: "SAFE_MERGE",
        summary: "本地安全合并完成：feature/sino-safe-merge-v1 → feature/foundation-reset-integration，merge HEAD: merge-head，尚未 push。",
        source_branch: "feature/sino-safe-merge-v1",
        source_head: "source-head",
        target_branch: "feature/foundation-reset-integration",
        target_head_before: "target-head",
        merge_strategy: "no_ff",
        merge_commit_head: "merge-head",
        merge_parent_count: 2,
        source_ancestor_verified: true,
        target_ancestor_verified: true,
        working_tree_clean_after: true,
        push_performed: false,
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("SAFE_MERGE")).toBeTruthy();
    expect(screen.getByText("feature/sino-safe-merge-v1")).toBeTruthy();
    expect(screen.getByText("source-head")).toBeTruthy();
    expect(screen.getByText("feature/foundation-reset-integration")).toBeTruthy();
    expect(screen.getByText("target-head")).toBeTruthy();
    expect(screen.getByText("merge-head")).toBeTruthy();
    expect(screen.getByText("Merge parents")).toBeTruthy();
    expect(screen.getByText("Target pushed")).toBeTruthy();
    expect(screen.getByText("NO")).toBeTruthy();
  });

  it("shows safe merge conflict files and blocked reason", () => {
    const value = {
      ...snapshot("conv-safe-merge-conflict", [{ message_id: "m1", role: "founder", content: "合并 feature 到 integration" }]),
      sino_brain: { discovery: { operational_runtime: { status: "failed", task_id: "task-merge", execution_id: "execution-merge", operation_type: "SAFE_MERGE", result: {
        operation_type: "SAFE_MERGE",
        summary: "合并检测到冲突，已停止自动处理。",
        source_branch: "feature/sino-safe-merge-v1",
        source_head: "source-head",
        target_branch: "feature/foundation-reset-integration",
        target_head_before: "target-head",
        failure_type: "MERGE_CONFLICT",
        conflict: true,
        conflict_files: ["frontend/src/App.jsx"],
        push_performed: false,
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("执行失败")).toBeTruthy();
    expect(screen.getByText("MERGE_CONFLICT")).toBeTruthy();
    expect(screen.getByText("frontend/src/App.jsx")).toBeTruthy();
  });

  it("shows safe merge changed-head block reason", () => {
    const value = {
      ...snapshot("conv-safe-merge-head", [{ message_id: "m1", role: "founder", content: "合并 feature 到 integration" }]),
      sino_brain: { discovery: { operational_runtime: { status: "failed", task_id: "task-merge", execution_id: "execution-merge", operation_type: "SAFE_MERGE", result: {
        operation_type: "SAFE_MERGE",
        summary: "source HEAD changed after approval",
        source_branch: "feature/sino-safe-merge-v1",
        source_head: "changed-source",
        target_branch: "feature/foundation-reset-integration",
        target_head_before: "target-head",
        failure_type: "SOURCE_HEAD_CHANGED",
        push_performed: false,
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("SOURCE_HEAD_CHANGED")).toBeTruthy();
    expect(screen.getByText("changed-source")).toBeTruthy();
  });

  it("shows safe integration push success and already-up-to-date details", () => {
    const value = {
      ...snapshot("conv-integration-push", [{ message_id: "m1", role: "founder", content: "推送 integration branch" }]),
      sino_brain: { discovery: { operational_runtime: { status: "completed", task_id: "task-push", execution_id: "execution-push", operation_type: "SAFE_INTEGRATION_PUSH", result: {
        operation_type: "SAFE_INTEGRATION_PUSH",
        summary: "Integration 安全推送完成",
        integration_branch: "feature/foundation-reset-integration",
        integration_head: "merge-head",
        remote_name: "origin",
        remote_branch: "feature/foundation-reset-integration",
        remote_head_after: "merge-head",
        ahead_before: 1,
        push_performed: true,
        force_used: false,
        tags_pushed: false,
      } } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("SAFE_INTEGRATION_PUSH")).toBeTruthy();
    expect(screen.getAllByText("feature/foundation-reset-integration").length).toBeGreaterThan(0);
    expect(screen.getAllByText("merge-head").length).toBeGreaterThan(0);
    expect(screen.getByText("Integration commits pushed")).toBeTruthy();
    expect(screen.getByText("Integration force")).toBeTruthy();
    expect(screen.getByText("Integration tags pushed")).toBeTruthy();
  });

  it("shows safe integration push block reasons for remote and local HEAD changes", () => {
    const value = {
      ...snapshot("conv-integration-push-blocked", [{ message_id: "m1", role: "founder", content: "推送 integration branch" }]),
      sino_brain: { discovery: { operational_runtime: { status: "failed", task_id: "task-push", execution_id: "execution-push", operation_type: "SAFE_INTEGRATION_PUSH", result: {
        operation_type: "SAFE_INTEGRATION_PUSH",
        summary: "remote integration branch changed after approval",
        integration_branch: "feature/foundation-reset-integration",
        integration_head: "merge-head",
        remote_name: "origin",
        remote_branch: "feature/foundation-reset-integration",
        failure_type: "REMOTE_STATE_CHANGED",
        push_performed: false,
        force_used: false,
        tags_pushed: false,
      } } } },
    };
    const { rerender } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("REMOTE_STATE_CHANGED")).toBeTruthy();
    expect(screen.getByText("remote integration branch changed after approval")).toBeTruthy();
    rerender(<ConversationThread snapshot={{ ...value, sino_brain: { discovery: { operational_runtime: { ...value.sino_brain.discovery.operational_runtime, result: { ...value.sino_brain.discovery.operational_runtime.result, failure_type: "HEAD_CHANGED_AFTER_APPROVAL", summary: "integration HEAD changed after approval" } } } } }} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("HEAD_CHANGED_AFTER_APPROVAL")).toBeTruthy();
    expect(screen.getByText("integration HEAD changed after approval")).toBeTruthy();
  });

  it("shows autonomous mission status, goal, branch and next required action", () => {
    const value = {
      ...snapshot("conv-mission", [{ message_id: "m1", role: "founder", content: "完成一个小型开发目标" }]),
      sino_brain: {
        discovery: {
          autonomous_development_mission_view: {
            mission_id: "mission-1",
            goal: "把状态卡文案改清楚并验证",
            status: "WAITING_CHANGE_APPROVAL",
            stage: "WAITING_CHANGE_APPROVAL",
            stage_label: "等待你批准代码修改",
            progress: { completed: 1, total: 7, label: "1 / 7 completed" },
            working_branch: "feature/sino-mission-status-card-copy",
            baseline: { branch: "feature/foundation-reset-integration", head: "baseline-head" },
            current_head: "baseline-head",
            risk_level: "MEDIUM",
            last_completed_step: "已创建工作分支",
            next_required_action: "批准代码修改",
            timeline: [
              { key: "planning", label: "规划", status: "completed" },
              { key: "change", label: "修改", status: "waiting_approval" },
              { key: "verification", label: "验证", status: "pending" },
            ],
            current_work_summary: ["目标：把状态卡文案改清楚并验证", "工作分支：feature/sino-mission-status-card-copy", "接下来：批准代码修改"],
            pending_approval: {
              action_id: "bounded-code-change:mission-1",
              action_type: "BOUNDED_CODE_CHANGE_APPROVAL",
              label: "批准代码修改",
              risk_level: "MEDIUM",
              scope: ["frontend/src/sino-founder/ConversationThread.jsx"],
              will_do: ["修改明确授权文件", "自动运行 focused test / build", "自动创建本地 checkpoint"],
              will_not_do: ["不会 push", "不会 merge", "不会 deploy"],
            },
          },
        },
      },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("complementary", { name: "Mission Status" })).toBeTruthy();
    expect(screen.getByText("等待你批准代码修改")).toBeTruthy();
    expect(screen.queryByText("WAITING_CHANGE_APPROVAL")).toBeNull();
    expect(screen.getByText("把状态卡文案改清楚并验证")).toBeTruthy();
    expect(screen.getByText("feature/sino-mission-status-card-copy")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Mission Timeline" })).toBeTruthy();
    expect(screen.getByText("1 / 7 completed")).toBeTruthy();
    expect(screen.getByText("已创建工作分支")).toBeTruthy();
    expect(screen.getAllByText("批准代码修改").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "Current Work Summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Mission Approval Summary" })).toBeTruthy();
    expect(screen.getByText("What Sino WILL do")).toBeTruthy();
    expect(screen.getByText("What Sino WILL NOT do")).toBeTruthy();
    expect(screen.getByText("自动创建本地 checkpoint")).toBeTruthy();
    expect(screen.getByText("不会 deploy")).toBeTruthy();
  });

  it("shows autonomous mission checkpoint, merge and completed integration result", () => {
    const value = {
      ...snapshot("conv-mission-complete", [{ message_id: "m1", role: "founder", content: "完成一个小型开发目标" }]),
      sino_brain: {
        discovery: {
          autonomous_development_mission_view: {
            mission_id: "mission-2",
            goal: "完成完整开发任务",
            status: "COMPLETED",
            stage: "COMPLETED",
            stage_label: "已完成",
            progress: { completed: 7, total: 7, label: "7 / 7 completed" },
            working_branch: "feature/sino-mission-status-card-copy",
            current_head: "merge-head",
            last_completed_step: "已推送 integration branch",
            timeline: [
              { key: "planning", label: "规划", status: "completed" },
              { key: "change", label: "修改", status: "completed" },
              { key: "verification", label: "验证", status: "completed" },
              { key: "checkpoint", label: "Checkpoint", status: "completed" },
              { key: "feature_push", label: "Feature Push", status: "completed" },
              { key: "merge", label: "Merge", status: "completed" },
              { key: "integration_push", label: "Integration Push", status: "completed" },
            ],
            changed_files: { items: [{ path: "frontend/src/sino-founder/ConversationThread.jsx", boundary: "approved" }], total: 1, more: 0 },
            verification_summary: { status: "PASS", passed: 36, failed: 0, errors: 0, build_status: "PASS" },
            checkpoint_summary: { commit_message: "fix: mission copy", commit_head: "checkpoint-head", commit_file_count: 1, working_tree_clean_after: true },
            feature_push_summary: { branch: "feature/sino-mission-status-card-copy", remote: "origin", remote_branch: "feature/sino-mission-status-card-copy", head: "checkpoint-head", commits_pushed: 1, force: "NO" },
            merge_summary: { source_branch: "feature/sino-mission-status-card-copy", target_branch: "feature/foundation-reset-integration", merge_head: "merge-head", strategy: "--no-ff", conflict: "NO", pushed: "NO" },
            integration_push_summary: { branch: "feature/foundation-reset-integration", remote: "origin", remote_head: "merge-head", force: "NO", tags: "NO", remote_updated: "YES" },
            completion_summary: { goal: "完成完整开发任务", feature_branch: "feature/sino-mission-status-card-copy", final_integration_head: "merge-head" },
          },
        },
      },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    expect(screen.queryByText("COMPLETED")).toBeNull();
    expect(screen.getByRole("region", { name: "Changed Files" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Verification Summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Checkpoint Summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Feature Push Summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Merge Summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Integration Push Summary" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Mission Completion Summary" })).toBeTruthy();
    expect(screen.getAllByText("checkpoint-head").length).toBeGreaterThan(0);
    expect(screen.getAllByText("merge-head").length).toBeGreaterThan(0);
    expect(screen.getByText("已推送 integration branch")).toBeTruthy();
    expect(screen.getByText("Remote integration updated")).toBeTruthy();
    expect(screen.getByText("YES")).toBeTruthy();
  });

  it("shows autonomous mission failed stage and restores from snapshot reload", () => {
    const value = {
      ...snapshot("conv-mission-failed", [{ message_id: "m1", role: "founder", content: "完成一个小型开发目标" }]),
      sino_brain: {
        discovery: {
          autonomous_development_mission_view: {
            mission_id: "mission-3",
            goal: "完成完整开发任务",
            status: "FAILED",
            stage: "FAILED",
            stage_label: "失败",
            next_required_action: "REVIEW_FAILURE",
            timeline: [{ key: "verification", label: "验证", status: "failed" }],
            failure_summary: { failed_stage: "正在验证", failure_type: "VERIFICATION_FAILED", summary: "2 tests failed", last_successful_stage: "CHANGING", safe_next_action: "继续讨论并修复测试" },
          },
        },
      },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getAllByText("失败").length).toBeGreaterThan(0);
    expect(screen.queryByText("FAILED")).toBeNull();
    expect(screen.getByText("正在验证")).toBeTruthy();
    expect(screen.getByText("VERIFICATION_FAILED")).toBeTruthy();
    expect(screen.getByText("REVIEW_FAILURE")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Failed Mission Summary" })).toBeTruthy();
    expect(screen.getByText("继续讨论并修复测试")).toBeTruthy();
  });

  it("shows autonomous mission blocked summary", () => {
    const value = {
      ...snapshot("conv-mission-blocked", [{ message_id: "m1", role: "founder", content: "完成一个小型开发目标" }]),
      sino_brain: { discovery: { autonomous_development_mission_view: {
        mission_id: "mission-blocked",
        goal: "推送 integration",
        status: "BLOCKED",
        stage: "BLOCKED",
        stage_label: "已阻塞",
        failure_summary: { failed_stage: "正在推送 integration", failure_type: "REMOTE_STATE_CHANGED", summary: "远程分支在批准后发生变化", last_successful_stage: "MERGING", safe_next_action: "重新确认远程状态后再决定。" },
      } } },
    };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("已阻塞")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Blocked Mission Summary" })).toBeTruthy();
    expect(screen.getByText("REMOTE_STATE_CHANGED")).toBeTruthy();
    expect(screen.getByText("重新确认远程状态后再决定。")).toBeTruthy();
  });

  it("keeps operational runtime isolated by conversation snapshot", () => {
    const convA = {
      ...snapshot("conv-a", [{ message_id: "m1", role: "founder", content: "检查状态" }]),
      sino_brain: { discovery: { operational_runtime: { status: "completed", task_id: "task-a", execution_id: "execution-a", result: { result: { branch: "branch-a", head: "head-a", working_tree_clean: true } } } } },
    };
    const convB = snapshot("conv-b", [{ message_id: "m2", role: "founder", content: "普通讨论" }]);
    const { rerender } = render(<ConversationThread snapshot={convA} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("branch-a")).toBeTruthy();
    rerender(<ConversationThread snapshot={convB} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.queryByText("branch-a")).toBeNull();
  });

  it("keeps autonomous mission isolated by conversation snapshot", () => {
    const convA = {
      ...snapshot("conv-mission-a", [{ message_id: "m1", role: "founder", content: "开发目标 A" }]),
      sino_brain: { discovery: { autonomous_development_mission_view: { mission_id: "mission-a", goal: "开发目标 A", stage_label: "等待你批准合并到 integration", working_branch: "feature/sino-mission-a" } } },
    };
    const convB = snapshot("conv-mission-b", [{ message_id: "m2", role: "founder", content: "开发目标 B" }]);
    const { rerender } = render(<ConversationThread snapshot={convA} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("feature/sino-mission-a")).toBeTruthy();
    rerender(<ConversationThread snapshot={convB} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.queryByText("feature/sino-mission-a")).toBeNull();
  });


  it("wires approve, reject and revision feedback to real proposal actions", async () => {
    const onDecision = vi.fn().mockResolvedValue(undefined);
    const proposal = { proposal_id: "proposal-actions", proposal_version: 3, status: "ready_for_founder_decision", current_problem: "Boundary", proposed_boundary: "Ready only", founder_responsibilities: [], studio_responsibilities: [], capability_lifecycle: [], binding_contract: {}, migration_impact: [], risks: [] };
    const { rerender } = render(<ArchitectureProposalCard proposal={proposal} busy={false} onDecision={onDecision} />);
    fireEvent.click(screen.getByRole("button", { name: "批准方案" }));
    expect(onDecision).toHaveBeenCalledWith({ action: "approve", proposalId: "proposal-actions", proposalVersion: 3 });
    fireEvent.click(screen.getByRole("button", { name: "驳回方案" }));
    expect(onDecision).toHaveBeenCalledWith({ action: "reject", proposalId: "proposal-actions", proposalVersion: 3 });
    fireEvent.click(screen.getByRole("button", { name: "修改方案" }));
    await waitFor(() => expect(screen.getByLabelText("Architecture Proposal 修改意见")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("请输入希望调整的架构边界、职责或约束。"), { target: { value: "Studio 只引用 Ready Capability" } });
    fireEvent.click(screen.getByRole("button", { name: "提交修改意见" }));
    expect(onDecision).toHaveBeenCalledWith({ action: "submit_revision", proposalId: "proposal-actions", proposalVersion: 3, founderFeedback: "Studio 只引用 Ready Capability" });
    rerender(<ArchitectureProposalCard proposal={{ ...proposal, decision_status: "approved", status: "approved" }} busy={false} onDecision={onDecision} />);
    expect(screen.getByText(/方案已批准/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "批准方案" })).toBeNull();
  });
  it("keeps Standard Task messages in the Conversation instead of rendering a lane dashboard", () => {
    const value = snapshot("standard-task", [{ message_id: "m1", role: "founder", content: "给能力仓库增加搜索" }]);
    value.sino_brain = { active_workspace_stage: "execution", stage_workspaces: [{ stage_key: "execution", label: "Execution", status: "active", message_refs: ["m1"] }], discovery: { task_complexity_route: { classification: "STANDARD_TASK", standard_task_contract: { target_surface: "Capability Repository" }, current_step: "execution", execution_status: "execution" } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("给能力仓库增加搜索")).toBeTruthy();
    expect(screen.queryByLabelText("Standard Task 流程")).toBeNull();
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
    expect(screen.queryByRole("button", { name: "开始讨论" })).toBeNull();
  });
  it("keeps Quick Fix messages in the Conversation instead of rendering a lane dashboard", () => {
    const value = snapshot("quick-fix", [{ message_id: "m1", role: "founder", content: "修一下左边栏折叠" }]);
    value.sino_brain = { ...(value.sino_brain || {}), active_workspace_stage: "issue", stage_workspaces: [
      { stage_key: "issue", label: "问题", status: "active", message_refs: ["m1"] },
      { stage_key: "inspect", label: "定位", status: "pending", message_refs: [] },
    ], discovery: { task_complexity_route: { classification: "QUICK_FIX", evidence: { image_context_status: "unavailable" } } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("修一下左边栏折叠")).toBeTruthy();
    expect(screen.queryByLabelText("Quick Fix 流程")).toBeNull();
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it.skip("projects an autonomously completed Quick Fix at the Completed step", () => {
    const value = snapshot("quick-complete", [{ message_id: "m1", role: "founder", content: "修复折叠" }]);
    value.sino_brain = { source_message_refs: ["m1"], active_workspace_stage: "issue", discovery: { task_complexity_route: { classification: "QUICK_FIX", execution_status: "completed", evidence: {} } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByLabelText("讨论记录").dataset.stageWorkspace).toBe("完成");
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it.skip("never exposes Continue while a clear Quick Fix is progressing autonomously", () => {
    const value = snapshot("quick-inspect", [{ message_id: "m1", role: "founder", content: "隐藏滚动条，保留滚动" }]);
    value.sino_brain = { active_workspace_stage: "inspect", current_action: { action_id: "quick_fix_inspecting", title: "正在定位问题", description: "自动检查目标容器", primary_label: null }, stage_workspaces: [
      { stage_key: "issue", label: "问题", status: "completed", message_refs: ["m1"] },
      { stage_key: "inspect", label: "定位", status: "active", message_refs: ["m1"] },
    ], discovery: { task_complexity_route: { classification: "QUICK_FIX", clarification_required: false, founder_gate_required: false, current_step: "inspect", execution_status: "inspecting", manual_continue_count: 0, evidence: {} } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getAllByText("正在定位问题")).toHaveLength(1);
    expect(screen.queryByLabelText("实时执行详情")).toBeNull();
    expect(screen.queryByLabelText(/任务进度/)).toBeNull();
    expect(screen.queryByRole("button", { name: "继续" })).toBeNull();
    expect(screen.queryByText("继续理解目标")).toBeNull();
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it("keeps ambiguous visual grounding in the Quick Fix clarification lane", () => {
    const value = snapshot("quick-clarify", [{ message_id: "m1", role: "founder", content: "这里不对" }]);
    value.sino_brain = { active_workspace_stage: "issue", discovery: { task_complexity_route: { classification: "QUICK_FIX", clarification_required: true, quick_fix_contract: { target_area: "截图标注区域" }, evidence: {} } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("这里不对")).toBeTruthy();
    expect(screen.queryByLabelText("实时执行详情")).toBeNull();
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it("links a Cognitive Outcome to its canonical Draft without replacing the source message", () => {
    const openDraft = vi.fn();
    const grounding = { cognitive_work: { cognitive_outcome_id: "cognitive-real" } };
    const draft = { draft_id: "draft-real", title: "System Definition Draft", draft_type: "system_definition", status: "refining", source_cognitive_outcome_ref: "cognitive-real" };
    render(<ConversationThread snapshot={snapshot("conv-canonical", [{ message_id: "outcome-message", role: "assistant", content: "完整 Cognitive Outcome", grounding }])} drafts={[draft]} onOpenDraft={openDraft} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("完整 Cognitive Outcome")).toBeTruthy();
    expect(screen.getByText("本轮成果")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看草案" }));
    expect(openDraft).toHaveBeenCalledWith(draft);
  });
  it.skip("keeps one Project Planning primary action in the workspace", () => {
    const continuePlanning = vi.fn();
    const value = { ...snapshot("project-planning", [{ message_id: "message-1", role: "assistant", content: "Sino 最新分析" }]), sino_brain: { stage: "project_planning", active_workspace_stage: "goal", current_action: { action_id: "continue_project_planning", title: "Project Planning", description: "旧动作说明", primary_label: "继续讨论" }, discovery: { discussion_maturity: { maturity_status: "continue_analysis", reason: "Sino 仍可基于已有 Project Context 完成实质分析，无需 Founder 补充信息。", outcomes: [{ outcome_id: "draft", title: "尚未进入审核" }] } }, stage_workspaces: [{ stage_id: "planning:goal", stage_key: "goal", label: "Project Planning", status: "active", summary: "Project Context 分析进行中", message_refs: ["message-1"] }] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} onContinueProjectAnalysis={continuePlanning} />);
    expect(screen.queryByRole("button", { name: "继续讨论" })).toBeNull();
    const primary = screen.getByRole("button", { name: "继续分析" });
    expect(screen.getByText("继续自主分析")).toBeTruthy();
    expect(screen.queryByText("Discussion Maturity")).toBeNull();
    expect(screen.queryByText("尚未进入审核")).toBeNull();
    const log = screen.getByLabelText("讨论记录");
    const action = log.querySelector(".sino-founder-action-card");
    const latestMessage = screen.getByText("Sino 最新分析");
    expect(action).toBeTruthy();
    expect(latestMessage.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(primary);
    expect(continuePlanning).toHaveBeenCalledTimes(1);
  });
  it.skip("shows the locked Cognitive Work target while autonomous analysis is running", () => {
    const value = { ...snapshot("cognitive-running", [{ message_id: "m1", role: "assistant", content: "上一轮结果" }]), sino_brain: { stage: "project_planning", active_workspace_stage: "goal", discovery: { discussion_maturity: { maturity_status: "continue_analysis", autonomous_next_analysis: "完成治理边界定义" }, cognitive_work_run: { run_id: "run-1", work_target: "完成治理边界定义", run_status: "running" } }, stage_workspaces: [{ stage_id: "planning:goal", stage_key: "goal", label: "Project Planning", status: "active", message_refs: ["m1"] }] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy onContinueProjectAnalysis={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sino 正在执行" })).toBeTruthy();
    expect(screen.getByText("完成治理边界定义")).toBeTruthy();
    expect(screen.getByText("分析中")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "继续分析" })).toBeNull();
  });
  it.skip("projects a blocking maturity judgment as Founder input without a continue action", () => {
    const value = { ...snapshot("blocking-planning", [{ message_id: "message-1", role: "assistant", content: "当前分析" }]), sino_brain: { stage: "project_planning", active_workspace_stage: "goal", current_action: { action_id: "answer_project_question", title: "需要 Founder 判断", description: "边界选择待确认", primary_label: "回答关键问题" }, discovery: { discussion_maturity: { maturity_status: "founder_input_required", reason: "该选择会改变系统边界。", blocking_question: "是否允许跨业务域共享学习结果？", why_founder_needed: "这属于 Founder 的产品治理权限。", sino_recommendation: "首版保持域内隔离。", recommendation_reason: "避免错误学习跨域传播。" } }, stage_workspaces: [{ stage_id: "planning:goal", stage_key: "goal", label: "Project Planning", status: "active", message_refs: ["message-1"] }] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("heading", { name: "需要 Founder 判断" })).toBeTruthy();
    expect(screen.getByText(/为什么需要 Founder：这属于 Founder 的产品治理权限/)).toBeTruthy();
    expect(screen.getByText(/Sino 建议：首版保持域内隔离/)).toBeTruthy();
    expect(screen.getByText(/建议理由：避免错误学习跨域传播/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /继续分析|回答关键问题/ })).toBeNull();
  });
  it.skip("drops resolved blocker content from the latest Current Action projection", () => {
    const value = { ...snapshot("resolved-planning", [{ message_id: "answer", role: "founder", content: "采用推荐边界。" }, { message_id: "confirmation", role: "assistant", content: "已确认，继续推进定义。" }]), sino_brain: { stage: "project_planning", active_workspace_stage: "goal", current_action: { action_id: "answer_project_question", title: "需要 Founder 判断", description: "旧问题", primary_label: "回答关键问题" }, discovery: { blocking_question_resolution: { status: "resolved" }, discussion_maturity: { maturity_status: "continue_analysis", reason: "原问题已解决。", autonomous_next_analysis: "继续起草系统定义。", blocking_question: "旧问题", why_founder_needed: "旧理由", sino_recommendation: "旧建议" } }, stage_workspaces: [{ stage_id: "planning:goal", stage_key: "goal", label: "Project Planning", status: "active", message_refs: ["answer", "confirmation"] }] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("heading", { name: "继续自主分析" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续分析" })).toBeTruthy();
    expect(screen.queryByText("旧问题")).toBeNull();
    expect(screen.queryByText("旧理由")).toBeNull();
    expect(screen.queryByText("旧建议")).toBeNull();
  });
  it("normalizes strings, arrays, objects and null display values", () => {
    expect(normalizeDisplayText(null)).toBe("");
    expect(normalizeDisplayText(["一", { content: "二" }])).toBe("一；二");
    expect(normalizeDisplayText({ first: "一", second: true })).toBe("first：一；second：true");
    expect(normalizeTextList("单项")).toEqual(["单项"]);
    expect(normalizeTextList({ reason: "对象原因" })).toEqual(["对象原因"]);
  });

  it("uses the same structured message renderer for Founder and Sino", () => {
    const value = snapshot("markdown", [
      { message_id: "f1", role: "founder", content: "# Founder 标题\n\n1. 第一项\n2. 第二项" },
      { message_id: "a1", role: "assistant", content: "## Sino 标题\n\n- 建议一\n- 建议二" },
    ]);
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("heading", { level: 1, name: "Founder 标题" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Sino 标题" })).toBeTruthy();
    expect(container.querySelector('[data-role="founder"] .sino-message-body ol')).toBeTruthy();
    expect(container.querySelector('[data-role="assistant"] .sino-message-body ul')).toBeTruthy();
  });

  it("renders Founder and user roles as label-free user messages while preserving the Sino label", () => {
    const value = snapshot("message-presentation", [
      { message_id: "f1", role: "founder", content: "Founder 正文" },
      { message_id: "u1", role: "user", content: "User 正文" },
      { message_id: "a1", role: "assistant", content: "Sino 正文" },
    ]);
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const userMessages = container.querySelectorAll('[data-role="founder"]');
    expect(userMessages).toHaveLength(2);
    expect([...userMessages].every((item) => item.querySelector(":scope > strong") === null)).toBe(true);
    expect(screen.queryByText("Founder", { exact: true })).toBeNull();
    expect(screen.queryByText("User", { exact: true })).toBeNull();
    expect(container.querySelector('[data-role="assistant"] > strong')?.textContent).toBe("* Sino");
  });

  it("renders Founder attachments before the text bubble and the timestamp after it", () => {
    const value = snapshot("founder-attachment", [{ message_id: "f1", role: "founder", content: "请检查截图", created_at: "2026-08-25T08:37:00Z", attachment_refs: [{ attachment_id: "image-1", original_filename: "founder.png" }] }]);
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const article = container.querySelector('[data-role="founder"]');
    const attachments = article.querySelector('[data-attachment-align="right"]');
    const bubble = article.querySelector(".sino-message-bubble--founder");
    const timestamp = article.querySelector(".sino-message-time");
    expect(attachments.compareDocumentPosition(bubble) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubble.compareDocumentPosition(timestamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bubble.contains(attachments)).toBe(false);
    expect(screen.getByAltText("founder.png")).toBeTruthy();
  });

  it("renders Sino attachments before the body and the timestamp after it", () => {
    const value = snapshot("sino-attachment", [{ message_id: "a1", role: "assistant", content: "这是生成结果", created_at: "2026-08-25T08:38:00Z", attachment_refs: [{ attachment_id: "image-2", original_filename: "sino.png" }] }]);
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const article = container.querySelector('[data-role="assistant"]');
    const attachments = article.querySelector('[data-attachment-align="left"]');
    const body = article.querySelector(".sino-message-body");
    const timestamp = article.querySelector(".sino-message-time");
    expect(attachments.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.compareDocumentPosition(timestamp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(body.contains(attachments)).toBe(false);
    expect(article.querySelector(":scope > strong")?.textContent).toBe("* Sino");
  });

  it("renders the persisted timestamp for Runtime execution narration", () => {
    const value = snapshot("runtime-time", [{
      message_id: "runtime-1", role: "assistant", message_type: "execution_update",
      content: "修改范围验证通过，正在运行定向测试。", created_at: "2026-08-27T00:28:25Z",
    }]);
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const timestamp = container.querySelector('[data-role="assistant"] .sino-message-time');
    expect(timestamp).toBeTruthy();
    expect(timestamp.getAttribute("datetime")).toBe("2026-08-27T00:28:25Z");
  });

  it("does not render an empty Founder bubble for an image-only message", () => {
    const value = snapshot("image-only", [{ message_id: "f1", role: "founder", content: "", created_at: "2026-08-25T08:39:00Z", attachment_refs: [{ attachment_id: "image-3", original_filename: "only.png" }] }]);
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const article = container.querySelector('[data-role="founder"]');
    expect(article.querySelector('[data-attachment-align="right"]')).toBeTruthy();
    expect(article.querySelector(".sino-message-bubble--founder")).toBeNull();
    expect(article.querySelector(".sino-message-time")).toBeTruthy();
  });

  it("renders a source message before its derived Constitution review exactly once", () => {
    const source = { message_id: "constitution-source", role: "founder", content: "# AI Commerce OS Constitution V1\n\n最高层 Constitution 原文" };
    const object = { name: "Intelligence Evolution Layer", layer: "foundation", role: "Foundation" };
    const value = { ...snapshot("constitution", [source]), sino_brain: { stage: "context_updated", active_workspace_stage: "goal", source_message_refs: [source.message_id], constitution_understanding: { status: "founder_approved", core_definition: "核心定义", foundation_layer: [object], application_layer: [], system_objects: [object], capability_lifecycle: [], capability_rules: [], proposed_work_items: [{ work_item_id: "work-1", title: "Intelligence Evolution Layer", existing_state: "existing", founder_decision: "approved" }] }, stage_workspaces: [{ stage_id: "context", stage_key: "goal", label: "Constitution Understanding · Founder Review", status: "active", message_refs: [source.message_id] }] } };
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const sourceMessage = container.querySelector('[data-role="founder"]');
    const derived = screen.getByRole("region", { name: "Constitution Understanding" });
    expect(sourceMessage.compareDocumentPosition(derived) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getAllByRole("heading", { name: "AI Commerce OS Constitution V1" })).toHaveLength(1);
    expect(derived.textContent).toContain("Proposed Work Items");
  });

  it("collapses a processed long-form Founder source and restores the untouched original on demand", () => {
    const original = `# Enterprise Constitution\n\n${Array.from({ length: 18 }, (_, index) => `## Section ${index + 1}\n\n原始段落 ${index + 1}：${"完整内容".repeat(12)}`).join("\n\n")}`;
    const source = { message_id: "long-source", role: "founder", content: original };
    const object = { name: "System", layer: "foundation", role: "Foundation" };
    const value = { ...snapshot("long-document", [source]), sino_brain: { stage: "context_updated", active_workspace_stage: "goal", source_message_refs: [source.message_id], constitution_understanding: { status: "founder_approved", core_definition: "核心", foundation_layer: [object], application_layer: [], system_objects: [object], capability_lifecycle: [], capability_rules: [], proposed_work_items: [] }, stage_workspaces: [{ stage_id: "context", stage_key: "goal", label: "Founder Review", status: "active", message_refs: [source.message_id] }] } };
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const sourceMessage = container.querySelector('[data-role="founder"]');
    const derived = screen.getByRole("region", { name: "Constitution Understanding" });
    expect(screen.getByText("长文本 · 已进入后续处理")).toBeTruthy();
    expect(sourceMessage.querySelector(".sino-message-body")).toBeNull();
    expect(sourceMessage.compareDocumentPosition(derived) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "展开原文" }));
    expect(sourceMessage.querySelector(".sino-message-body").textContent).toContain("原始段落 18");
    fireEvent.click(screen.getByRole("button", { name: "收起原文" }));
    expect(sourceMessage.querySelector(".sino-message-body")).toBeNull();
  });

  it("never adds long-form controls to a short Founder message", () => {
    render(<ConversationThread snapshot={snapshot("short-message", [{ message_id: "short", role: "founder", content: "下一步怎么做？" }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.queryByRole("button", { name: "展开原文" })).toBeNull();
    expect(screen.queryByRole("button", { name: "收起原文" })).toBeNull();
    expect(screen.getByText("下一步怎么做？")).toBeTruthy();
  });

  it("keeps history and composer in independent flex regions", () => {
    const { container } = render(<ConversationThread snapshot={snapshot("conv-1", [{ message_id: "m1", role: "founder", content: "第一条消息" }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const thread = container.querySelector(".sino-conversation-thread");
    const log = screen.getByLabelText("讨论记录");
    const readingColumn = container.querySelector(".sino-conversation-reading-column");
    const composer = container.querySelector(".sino-conversation-composer-dock");
    expect(composer.classList.contains("sino-conversation-composer-layout")).toBe(true);
    expect(thread.contains(log)).toBe(true);
    expect(log.contains(readingColumn)).toBe(true);
    expect(readingColumn.contains(screen.getByText("第一条消息"))).toBe(true);
    expect(thread.contains(composer)).toBe(true);
    expect(log.nextElementSibling).toBe(composer);
    expect(composer.nextElementSibling.classList.contains("sino-conversation-workspace-safe-area")).toBe(true);
    expect(composer.contains(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……"))).toBe(true);
    expect(thread.classList.contains("sino-conversation-thread")).toBe(true);
    expect(log.classList.contains("sino-conversation-log")).toBe(true);
    expect(screen.getByText("第一条消息")).toBeTruthy();
  });

  it("scrolls restored history and a newly sent message to the newest item", () => {
    const onSend = vi.fn((event) => event.preventDefault());
    const { rerender } = render(<ConversationThread snapshot={snapshot("conv-empty", [])} message="新消息" onMessage={vi.fn()} onSend={onSend} busy={false} />);
    const log = screen.getByLabelText("讨论记录");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 900 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 300 });

    rerender(<ConversationThread snapshot={snapshot("conv-restored", [{ message_id: "m1", role: "founder", content: "历史最新消息" }])} message="新消息" onMessage={vi.fn()} onSend={onSend} busy={false} />);
    expect(log.scrollTop).toBe(900);

    log.scrollTop = 600;
    fireEvent.submit(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……").closest("form"));
    expect(onSend).toHaveBeenCalledTimes(1);
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1200 });
    rerender(<ConversationThread snapshot={snapshot("conv-restored", [{ message_id: "m1", role: "founder", content: "历史最新消息" }, { message_id: "m2", role: "assistant", content: "Sino 最新回复" }])} message="" onMessage={vi.fn()} onSend={onSend} busy={false} />);
    expect(log.scrollTop).toBe(1200);
    expect(screen.getByText("Sino 最新回复")).toBeTruthy();
  });

  it("does not force-scroll when Founder is reading older history", () => {
    const onSend = vi.fn((event) => event.preventDefault());
    const { rerender } = render(<ConversationThread snapshot={snapshot("conv-history", [{ message_id: "m1", role: "founder", content: "较早消息" }])} message="继续" onMessage={vi.fn()} onSend={onSend} busy={false} />);
    const log = screen.getByLabelText("讨论记录");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 300 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    fireEvent.submit(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……").closest("form"));
    rerender(<ConversationThread snapshot={snapshot("conv-history", [{ message_id: "m1", role: "founder", content: "较早消息" }, { message_id: "m2", role: "assistant", content: "新回复" }])} message="" onMessage={vi.fn()} onSend={onSend} busy={false} />);
    expect(log.scrollTop).toBe(100);
    expect(screen.getByRole("button", { name: "↓ 最新" })).toBeTruthy();
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1500 });
    fireEvent.click(screen.getByRole("button", { name: "↓ 最新" }));
    expect(log.scrollTop).toBe(1500);
    expect(screen.queryByRole("button", { name: "↓ 最新" })).toBeNull();
  });

  it.skip("follows a material Current Action update while Founder remains near latest", () => {
    const first = { ...snapshot("conv-action", [{ message_id: "m1", role: "assistant", content: "分析完成" }]), sino_brain: { stage: "project_planning", current_action: { title: "Project Planning" }, discovery: { discussion_maturity: { maturity_status: "continue_analysis", reason: "继续形成定义", autonomous_next_analysis: "形成边界" } } } };
    const { rerender } = render(<ConversationThread snapshot={first} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} onContinueProjectAnalysis={vi.fn()} />);
    const log = screen.getByLabelText("讨论记录");
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1000 });
    Object.defineProperty(log, "clientHeight", { configurable: true, value: 300 });
    log.scrollTop = 700; fireEvent.scroll(log);
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 1250 });
    const next = { ...first, sino_brain: { ...first.sino_brain, discovery: { discussion_maturity: { maturity_status: "continue_analysis", reason: "新的实质分析已就绪", autonomous_next_analysis: "验证接口" } } } };
    rerender(<ConversationThread snapshot={next} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} onContinueProjectAnalysis={vi.fn()} />);
    expect(log.scrollTop).toBe(1250);
    expect(screen.getByRole("button", { name: "继续分析" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "↓ 最新" })).toBeNull();
  });

  it("keeps persisted Context Sources out of the Conversation reading flow", () => {
    const grounding = { schema_version: 1, sources: [
      { key: "living_prompt", label: "动态提示词", available: true, used: true, version: "v2", references: [{ source_id: "project-1", title: "AI Commerce OS" }] },
      { key: "knowledge", label: "项目知识", available: true, used: true, count: 3 },
      { key: "constraints", label: "项目约束", available: true, used: false, count: 0 },
      { key: "current_conversation", label: "当前会话", available: true, used: true, count: 2 },
      { key: "founder_current_message", label: "Founder 当前输入", available: true, used: true, count: 1 },
      { key: "external_model_knowledge", label: "模型通用知识", available: true, used: true },
    ] };
    render(<ConversationThread snapshot={snapshot("conv-grounded", [{ message_id: "m1", role: "assistant", content: "基于项目上下文回答。", grounding }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("基于项目上下文回答。")).toBeTruthy();
    expect(screen.queryByText("本次依据")).toBeNull();
    expect(screen.queryByText("动态提示词")).toBeNull();
  });

  it("does not insert unscoped grounding into a normal reply", () => {
    const grounding = { schema_version: 1, sources: [
      { key: "living_prompt", label: "动态提示词", available: false, used: false },
      { key: "knowledge", label: "项目知识", available: false, used: false, count: 0 },
      { key: "current_conversation", label: "当前会话", available: true, used: true, count: 1 },
      { key: "founder_current_message", label: "Founder 当前输入", available: true, used: true, count: 1 },
      { key: "external_model_knowledge", label: "模型通用知识", available: true, used: true },
    ] };
    render(<ConversationThread snapshot={snapshot("conv-unscoped", [{ message_id: "m1", role: "assistant", content: "通用回答。", grounding }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.queryByText("本次依据")).toBeNull();
    expect(screen.queryByText("动态提示词")).toBeNull();
    expect(screen.queryByText("项目知识")).toBeNull();
  });

  it("renders malformed and legacy Council proposal shapes without crashing", () => {
    const council = {
      council_run_id: "legacy-run", question: "继续讨论", status: "completed_partial",
      recommendation: { text: "基于可用模型继续" }, consensus: "形成核心方向",
      disagreements: { reason: "实施顺序不同" }, risks: "资源风险", candidate_goal: { title: "验证方案" },
      model_runs: [
        { provider: "deepseek", status: "completed", proposal: { core_judgment: 1, key_reasons: "单条理由", risks: { content: "对象风险" }, objections: ["异议一", "异议二"] } },
        { provider: "gpt", status: "unavailable", proposal: null },
        { provider: "claude", status: "unavailable", proposal: {} },
      ],
    };
    const value = { ...snapshot("legacy", [{ message_id: "f1", role: "founder", content: "继续讨论", message_type: "council" }]), council_runs: [council] };
    render(<ConversationThread snapshot={value} message="第三条" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText(/主要理由：单条理由/)).toBeTruthy();
    expect(screen.getByText(/风险：对象风险/)).toBeTruthy();
    expect(screen.getAllByText("暂时不可用")).toHaveLength(2);
    expect(screen.getByText(/主要共识：形成核心方向/)).toBeTruthy();
    expect(screen.getByText(/关键分歧：实施顺序不同/)).toBeTruthy();
    expect(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……").value).toBe("第三条");
  });

  it("isolates an unreadable provider proposal and keeps the synthesis visible", () => {
    const value = { ...snapshot("malformed", [{ message_id: "f1", role: "founder", content: "异常格式", message_type: "council" }]), council_runs: [{ council_run_id: "bad", question: "异常格式", status: "completed_partial", recommendation: "继续综合", model_runs: [{ provider: "deepseek", status: "completed", proposal: null }] }] };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("返回内容暂时无法完整展示")).toBeTruthy();
    expect(screen.getByText(/综合判断：继续综合/)).toBeTruthy();
  });

  it("renders model and provider display identity instead of internal provider id", () => {
    const run = { council_run_id: "identity", question: "模型身份", status: "completed", recommendation: "完成", participants: [{ provider: "ofoxai-a88d9dca", model: "openai/gpt-5.6-luna", model_display_name: "GPT-5.6 Luna", provider_display_name: "OfoxAI", perspective_label: "战略与价值" }], model_runs: [{ provider: "ofoxai-a88d9dca", model: "openai/gpt-5.6-luna", model_display_name: "GPT-5.6 Luna", provider_display_name: "OfoxAI", perspective_label: "战略与价值", status: "completed", proposal: { core_judgment: "观点" } }] };
    render(<ConversationThread snapshot={{ ...snapshot("identity", [{ message_id: "f1", role: "founder", content: "模型身份", message_type: "council" }]), council_runs: [run] }} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("* GPT-5.6 Luna · OfoxAI")).toBeTruthy();
    expect(screen.queryByText("ofoxai-a88d9dca")).toBeNull();
  });

  it("renders all Council participants and Sino on one pure-text left edge", () => {
    const run = {
      council_run_id: "stairs", question: "阶梯讨论", status: "completed_partial", recommendation: "综合结论",
      participants: [{ provider: "gpt" }, { provider: "claude" }, { provider: "deepseek" }],
      model_runs: [
        { provider: "gpt", status: "unavailable" },
        { provider: "claude", status: "unavailable" },
        { provider: "deepseek", status: "completed", proposal: { core_judgment: "一段很长但应该自然换行且不产生横向溢出的真实观点" } },
      ],
    };
    const value = { ...snapshot("stairs", [
      { message_id: "f1", role: "founder", content: "阶梯讨论", message_type: "council" },
      { message_id: "a1", role: "assistant", content: "普通 Sino 回复", message_type: "discussion" },
    ]), council_runs: [run] };
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const councilMessages = [...container.querySelectorAll(".sino-council-message")];
    expect(councilMessages.every((item) => !item.dataset.staircaseLevel)).toBe(true);
    expect(councilMessages[0].textContent).toContain("暂时不可用");
    expect(councilMessages[1].textContent).toContain("暂时不可用");
    expect(councilMessages[3].dataset.messageType).toBe("sino_synthesis");
    expect(councilMessages[3].querySelector("strong").textContent).toBe("* Sino");
    expect(screen.getByText("阶梯讨论").closest("article").classList.contains("sino-council-message")).toBe(false);
    expect(screen.getByText("普通 Sino 回复").closest("article").classList.contains("sino-council-message")).toBe(false);
  });

  it("renders partial Council Sino synthesis from consensus when recommendation is empty", () => {
    const run = {
      council_run_id: "partial-consensus", question: "部分讨论", status: "completed_partial", recommendation: "", consensus: ["真实共识"],
      participants: [{ provider: "gpt" }, { provider: "claude" }, { provider: "deepseek" }],
      model_runs: [
        { provider: "gpt", status: "unavailable" },
        { provider: "claude", status: "unavailable" },
        { provider: "deepseek", status: "completed", proposal: { core_judgment: "可用观点" } },
      ],
    };
    const value = { ...snapshot("partial-consensus", [{ message_id: "f1", role: "founder", content: "部分讨论", message_type: "council" }]), council_runs: [run] };
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText(/主要共识：真实共识/)).toBeTruthy();
    const synthesis = container.querySelector('[data-message-type="sino_synthesis"]');
    expect(synthesis).toBeTruthy();
    expect(synthesis.dataset.staircaseLevel).toBeUndefined();
  });

  it("guarantees exactly one final Sino slot for a completed partial run with empty synthesis fields", () => {
    const run = {
      council_run_id: "empty-synthesis", question: "空综合", status: "completed_partial",
      participants: [{ provider: "gpt" }, { provider: "claude" }, { provider: "deepseek" }],
      model_runs: [
        { provider: "gpt", status: "unavailable" },
        { provider: "claude", status: "unavailable" },
        { provider: "deepseek", status: "completed", proposal: { core_judgment: "真实观点" } },
      ],
    };
    const value = { ...snapshot("empty-synthesis", [{ message_id: "f1", role: "founder", content: "空综合", message_type: "council" }]), council_runs: [run] };
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const finalMessages = container.querySelectorAll('[data-message-type="sino_synthesis"]');
    expect(finalMessages).toHaveLength(1);
    expect(finalMessages[0].textContent).toContain("综合内容暂未完整返回");
    expect(finalMessages[0].dataset.staircaseLevel).toBeUndefined();
    expect(container.querySelector('[data-message-type="system_status"]')).toBeNull();
  });

  it("renders persisted auto-deliberation rounds, attribution, moderator, stop reason and final synthesis", () => {
    const modelRuns = [1, 2].flatMap((round) => [
      { model_run_id: `gpt-${round}`, round_number: round, model_display_name: "GPT-5.6 Luna", provider_display_name: "OfoxAI", status: "completed", proposal: { core_judgment: `GPT 第${round}轮观点` } },
      { model_run_id: `deepseek-${round}`, round_number: round, model_display_name: "DeepSeek Chat", provider_display_name: "DeepSeek", status: "completed", proposal: { objections: [`少数意见 ${round}`] } },
    ]);
    const run = { council_run_id: "auto-1", question: "争议问题", status: "completed", recommendation: "最终判断", consensus: ["主要共识"], disagreements: ["保留少数意见"], unique_insights: ["独特观点"], model_runs: modelRuns, deliberation: { stop_explanation: "连续两轮未出现新的关键证据，本轮结束。", source_refs: [{ model_run_id: "gpt-1" }], rounds: [1, 2].map((round) => ({ round_number: round, sino_round_summary: { consensus: [`共识 ${round}`], disagreements: [`分歧 ${round}`], new_information: [`信息 ${round}`], next_focus: round === 2 ? "讨论已基本形成结论" : "仍有明显分歧，继续讨论" } })) } };
    const value = { ...snapshot("auto", [{ message_id: "f-auto", role: "founder", content: "争议问题", message_type: "auto_deliberation" }, { message_id: "a-auto", role: "assistant", content: "持久化最终消息", message_type: "auto_deliberation" }]), council_runs: [run] };
    const { container } = render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText(/第 1 轮/)).toBeTruthy();
    expect(screen.getByText(/第 2 轮/)).toBeTruthy();
    expect(screen.getAllByText("* GPT-5.6 Luna · OfoxAI")).toHaveLength(2);
    expect(screen.getAllByText("* DeepSeek Chat · DeepSeek")).toHaveLength(2);
    expect(container.querySelectorAll('[data-message-type="sino_round_summary"]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-message-type="sino_synthesis"]')).toHaveLength(1);
    expect(screen.getByText(/保留少数意见/)).toBeTruthy();
    expect(screen.getByText("连续两轮未出现新的关键证据，本轮结束。")).toBeTruthy();
    const round = container.querySelector(".sino-deliberation-round");
    expect(round.open).toBe(true);
    fireEvent.click(round.querySelector("summary"));
    expect(round.open).toBe(false);
    fireEvent.click(round.querySelector("summary"));
    expect(round.open).toBe(true);
  });

  it.skip("renders one stateful Goal Brief card and suppresses repeated brief messages", () => {
    const confirm = vi.fn();
    const revise = vi.fn();
    const value = { ...snapshot("brief", [
      { message_id: "b1", role: "assistant", content: "旧 Goal Brief", message_type: "goal_brief" },
      { message_id: "f1", role: "founder", content: "正确", message_type: "goal_brief" },
      { message_id: "b2", role: "assistant", content: "重复 Goal Brief", message_type: "goal_brief" },
    ]), sino_brain: { stage: "goal_review", goal_readiness: "reviewable", goal_brief: { summary: "建立 AI 短剧生产能力", goal: "AI 短剧" }, discovery: { working_understanding: { known_context: ["Founder 先验证"], non_blocking_unknowns: ["技术路线"] } } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} onConfirmGoal={confirm} onReviseGoal={revise} />);
    expect(screen.getAllByText("Goal Brief")).toHaveLength(1);
    expect(screen.queryByText("旧 Goal Brief")).toBeNull();
    expect(screen.queryByText("重复 Goal Brief")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "确认目标并开始讨论" }));
    fireEvent.click(screen.getByRole("button", { name: "修正理解" }));
    expect(confirm).toHaveBeenCalled();
    expect(revise).toHaveBeenCalled();
  });

  it.skip("isolates messages by stage and restores the current Strategy workspace", () => {
    const value = { ...snapshot("stages", [
      { message_id: "goal-1", role: "founder", content: "Goal 历史" },
      { message_id: "strategy-1", role: "assistant", content: "Strategy 当前内容", message_type: "strategy_meeting" },
    ]), sino_brain: { stage: "strategy_meeting", active_workspace_stage: "strategy", stage_workspaces: [
      { stage_id: "goal", stage_key: "goal", label: "Goal Understanding", status: "completed", summary: "目标已确认", message_refs: ["goal-1"] },
      { stage_id: "strategy", stage_key: "strategy", label: "Strategy Meeting", status: "active", summary: "策略讨论中", message_refs: ["strategy-1"] },
      { stage_id: "validation", stage_key: "validation", label: "Validation", status: "locked", summary: "", message_refs: [] },
      { stage_id: "decision", stage_key: "decision", label: "Decision", status: "locked", summary: "", message_refs: [] },
      { stage_id: "package", stage_key: "package", label: "Discussion Package", status: "locked", summary: "", message_refs: [] },
    ] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} mode="auto" onModeChange={vi.fn()} />);
    expect(screen.getByText("Strategy 当前内容")).toBeTruthy();
    expect(screen.queryByText("Goal 历史")).toBeNull();
    expect(screen.getByLabelText("讨论记录").dataset.stageWorkspace).toBe("Strategy Meeting");
    expect(screen.getByRole("button", { name: /自动多轮/ }).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Goal/ }));
    expect(screen.getByText("Goal 历史")).toBeTruthy();
    expect(screen.queryByText("Strategy 当前内容")).toBeNull();
    expect(screen.getByText("Goal Understanding Completed")).toBeTruthy();
  });

  it.skip("locks future stages and disables auto deliberation outside Strategy", () => {
    const value = { ...snapshot("goal-stage", [{ message_id: "goal-1", role: "founder", content: "目标" }]), sino_brain: { active_workspace_stage: "goal", stage_workspaces: [
      { stage_id: "goal", stage_key: "goal", label: "Goal Understanding", status: "active", message_refs: ["goal-1"] },
      { stage_id: "strategy", stage_key: "strategy", label: "Strategy Meeting", status: "locked", message_refs: [] },
      { stage_id: "validation", stage_key: "validation", label: "Validation", status: "locked", message_refs: [] },
      { stage_id: "decision", stage_key: "decision", label: "Decision", status: "locked", message_refs: [] },
      { stage_id: "package", stage_key: "package", label: "Discussion Package", status: "locked", message_refs: [] },
    ] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} mode="auto" onModeChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Strategy/ }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /自动多轮/ }).disabled).toBe(true);
    expect(screen.getByText(/自动多轮只用于 Strategy Workspace/)).toBeTruthy();
  });

  it.skip("offers real reuse only for Ready assets and development for Candidate assets", () => {
    const onReuse = vi.fn();
    const onDevelop = vi.fn();
    const ready = { asset_id: "skill-ready", name: "商品分镜生成 Skill", status: "ready", version: 1, can_reuse: true, reuse_reason: "当前电商目标需要商品分镜" };
    const candidate = { asset_id: "skill-candidate", name: "商品标题优化 Skill", status: "candidate", version: 1, can_reuse: false, reuse_reason: "尚未开发完成" };
    render(<ConversationThread snapshot={snapshot("reuse", [{ message_id: "m1", role: "founder", content: "做抖音带货短视频" }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} reuseSuggestions={[ready, candidate]} onReuse={onReuse} onCapabilityAction={onDevelop} />);
    fireEvent.click(screen.getByRole("button", { name: "引用" }));
    fireEvent.click(screen.getByRole("button", { name: "开发" }));
    expect(onReuse).toHaveBeenCalledWith(ready);
    expect(onDevelop).toHaveBeenCalledWith(expect.objectContaining({ action_id: "candidates_saved", asset_id: "skill-candidate" }));
  });
});
