// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveExecutionDetail } from "./LiveExecutionDetail.jsx";

afterEach(() => cleanup());

function subject({ status = "executing", phase = "execution", route = {}, progress = {}, events = [] } = {}) {
  const brain = {
    execution_progress: { task_id: "task-1", execution_id: "execution-1", execution_status: status, current_phase: phase, next_action: "继续下一步", ...progress },
    discovery: { task_complexity_route: { classification: "STANDARD_TASK", current_step: phase, execution_status: status, standard_task_contract: { objective: "补全任务内容", target_surface: "能力仓库" }, ...route } },
  };
  return <LiveExecutionDetail brain={brain} snapshot={{ conversation: { title: "补全任务内容" }, active_execution: { events, result: { tests: ["frontend"], changed_files: ["a.jsx"] } } }} />;
}

describe("LiveExecutionDetail", () => {
  it("shows executing detail without a duplicate progress bar or percent", () => {
    render(subject({ events: [{ event_name: "codex_started", timestamp: "2026-08-19T00:00:00Z" }] }));
    expect(screen.getByLabelText("实时执行详情").textContent).toContain("补全任务内容");
    expect(screen.getByText("已开始实施代码修改")).toBeTruthy();
    expect(screen.queryByLabelText(/任务进度/)).toBeNull();
    expect(screen.queryByText(/35%/)).toBeNull();
  });

  it("names the visible verification target", () => {
    render(subject({ status: "testing", phase: "verification" }));
    expect(screen.getByText("正在验证能力仓库是否满足当前任务的验收条件。")).toBeTruthy();
  });

  it("explains self healing issue and attempt", () => {
    render(subject({ status: "self_healing", phase: "verification", route: { technical_resolution_contract: { issue_type: "Execution callback 未完成", resolution_status: "diagnosing", repair_plan: "重新对账并恢复验证", attempt_count: 1, retry_limit: 3 } } }));
    expect(screen.getByText("Execution callback 未完成")).toBeTruthy();
    expect(screen.getByText("重新对账并恢复验证")).toBeTruthy();
    expect(screen.getByText("1/3")).toBeTruthy();
  });

  it("shows stalled meaningful progress and safe diagnosis", () => {
    render(subject({ status: "stalled", progress: { stalled: true, meaningful_progress_at: new Date(Date.now() - 120000).toISOString() } }));
    expect(screen.getByText("诊断执行停滞")).toBeTruthy();
    expect(screen.getByText(/最后有效进展：2 分钟前/)).toBeTruthy();
  });

  it("summarizes a Founder Gate without copying decision buttons", () => {
    render(subject({ status: "waiting_for_founder_authorization", route: { founder_gate_contract: { reason: "外部调用需要授权", resume_action: "批准后继续验证" } } }));
    expect(screen.getByText("外部调用需要授权")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /批准|修改授权|驳回/ })).toBeNull();
  });

  it("shows completed result and opens the target", () => {
    const onViewResult = vi.fn();
    const brain = { execution_progress: { execution_status: "completed", current_phase: "complete", verification_status: "PASS" }, discovery: { task_complexity_route: { classification: "STANDARD_TASK", execution_status: "completed", standard_task_contract: { objective: "补全任务内容" }, visible_result: { title: "能力仓库搜索清除功能", verification_status: "PASS" } } } };
    render(<LiveExecutionDetail brain={brain} snapshot={{}} onViewResult={onViewResult} />);
    expect(screen.getByText("任务完成")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "查看结果" }));
    expect(onViewResult).toHaveBeenCalledOnce();
  });

  it("shows cancelled evidence state and keeps technical details folded", () => {
    render(subject({ status: "cancelled", phase: "complete" }));
    expect(screen.getByText("任务已停止")).toBeTruthy();
    expect(screen.getByText("Founder Emergency Stop")).toBeTruthy();
    expect(screen.getByText("查看技术详情").closest("details").hasAttribute("open")).toBe(false);
  });

  it("does not replace an architecture proposal", () => {
    const brain = { execution_progress: {}, discovery: { task_complexity_route: { classification: "STRATEGIC_TASK" } } };
    const { container } = render(<LiveExecutionDetail brain={brain} snapshot={{}} />);
    expect(container.innerHTML).toBe("");
  });
});
