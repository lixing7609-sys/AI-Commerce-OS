// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImplementationWorkspace } from "./ImplementationWorkspace.jsx";

describe("ImplementationWorkspace", () => {
  afterEach(cleanup);
  it("renders a real clickable object and its three lifecycle actions", () => {
    const item = { object_id: "object-1", object_type: "skill", type_label: "Skill", name: "Chrome Extension Skill", description: "浏览器端数据获取", status: "draft", version: 1, source_conversation_id: "conversation-1", dependency_object_ids: [], related_object_ids: [], execution_refs: [] };
    const approve = vi.fn(), discuss = vi.fn(), archive = vi.fn();
    render(<ImplementationWorkspace objects={[item]} onApprove={approve} onContinue={discuss} onArchive={archive} />);
    fireEvent.click(screen.getByRole("button", { name: /Chrome Extension Skill/ }));
    expect(screen.getAllByText(/V1/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "批准对象" }));
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    fireEvent.click(screen.getByRole("button", { name: "驳回 / 归档" }));
    expect(approve).toHaveBeenCalledWith(item); expect(discuss).toHaveBeenCalledWith(item); expect(archive).toHaveBeenCalledWith(item);
  });

  it("shows approved object state without implying execution or another approval action", () => {
    const item = { object_id: "object-approved", object_type: "task", name: "已批准任务对象", description: "只是对象批准", status: "approved", version: 1, source_conversation_id: "conversation-1", dependency_object_ids: [], related_object_ids: [], execution_refs: [] };
    render(<ImplementationWorkspace objects={[item]} onApprove={vi.fn()} onCreateTask={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /已批准任务对象/ }));
    expect(screen.getByText("已批准")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "批准对象" })).toBeNull();
    expect(screen.queryByText(/已进入执行 ·/)).toBeNull();
    expect(screen.queryByText(/执行中|任务已创建/)).toBeNull();
  });

  it("shows Create Task only for approved task objects and calls the bridge once", () => {
    const task = { object_id: "object-task", object_type: "task", name: "生成落地页 Agent", description: "approved task object", status: "approved", version: 1, source_conversation_id: "conversation-1", execution_refs: [] };
    const createTask = vi.fn();
    render(<ImplementationWorkspace objects={[task]} onCreateTask={createTask} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /生成落地页 Agent/ }));
    fireEvent.click(screen.getByRole("button", { name: "创建任务" }));
    expect(createTask).toHaveBeenCalledTimes(1);
    expect(createTask).toHaveBeenCalledWith(task);
  });

  it("hides Create Task for draft task and approved decision objects", () => {
    const draft = { object_id: "object-draft", object_type: "task", name: "草稿任务对象", status: "draft", version: 1, execution_refs: [] };
    const decision = { object_id: "object-decision", object_type: "decision", name: "已批准决策对象", status: "approved", version: 1, execution_refs: [] };
    const { rerender } = render(<ImplementationWorkspace objects={[draft]} onCreateTask={vi.fn()} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /草稿任务对象/ }));
    expect(screen.queryByRole("button", { name: "创建任务" })).toBeNull();
    rerender(<ImplementationWorkspace objects={[decision]} onCreateTask={vi.fn()} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /已批准决策对象/ }));
    expect(screen.queryByRole("button", { name: "创建任务" })).toBeNull();
  });

  it("shows safe TaskAsset state and hides Create Task when bridge relationship is restored", () => {
    const linked = { object_id: "object-linked", object_type: "task", name: "已桥接任务对象", description: "linked", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-asset-1", title: "已桥接任务对象", status: "draft", approval_status: "pending", execution_status: "not_started" } };
    render(<ImplementationWorkspace objects={[linked]} onCreateTask={vi.fn()} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /已桥接任务对象/ }));
    const detail = screen.getByLabelText("对象操作");
    expect(within(detail).getByText("已创建 TaskAsset")).toBeTruthy();
    expect(within(detail).getAllByText("已桥接任务对象").length).toBeGreaterThan(0);
    expect(within(detail).getByText("草稿")).toBeTruthy();
    expect(within(detail).getByText("待审批")).toBeTruthy();
    expect(within(detail).getByText("未开始")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "创建任务" })).toBeNull();
    expect(screen.queryByText(/执行中|已启动|Codex 正在执行|任务已批准执行/)).toBeNull();
  });

  it("shows execution approval actions for pending not-started TaskAssets", () => {
    const linked = { object_id: "object-approval", object_type: "task", name: "待审批任务", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-pending", title: "待审批任务", status: "draft", approval_status: "pending", execution_status: "not_started" } };
    render(<ImplementationWorkspace objects={[linked]} onApproveTaskExecution={vi.fn()} onRejectTaskExecution={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /待审批任务/ }));
    expect(screen.getByRole("button", { name: "批准执行" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "拒绝" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续讨论" })).toBeTruthy();
    expect(screen.queryByText(/执行中|已进入执行/)).toBeNull();
  });

  it("approves TaskAsset execution through the approval-only callback and keeps execution not started", async () => {
    const linked = { object_id: "object-approve-execution", object_type: "task", name: "批准执行任务", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-approve", title: "批准执行任务", status: "draft", approval_status: "pending", execution_status: "not_started" } };
    const approve = vi.fn().mockResolvedValue({ task_id: "task-approve", status: "draft", approval_status: "approved", execution_status: "not_started" });
    render(<ImplementationWorkspace objects={[linked]} onApproveTaskExecution={approve} onRejectTaskExecution={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /批准执行任务/ }));
    fireEvent.click(screen.getByRole("button", { name: "批准执行" }));
    await vi.waitFor(() => expect(approve).toHaveBeenCalledWith("task-approve"));
    const detail = screen.getByLabelText("对象操作");
    await vi.waitFor(() => expect(screen.getByText("已批准执行 · 等待开始执行")).toBeTruthy());
    expect(within(detail).getAllByText("已批准").length).toBeGreaterThan(0);
    expect(within(detail).getByText("未开始")).toBeTruthy();
    expect(screen.queryByText(/执行中|已进入执行/)).toBeNull();
  });

  it("rejects TaskAsset execution through the approval-only callback and keeps execution not started", async () => {
    const linked = { object_id: "object-reject-execution", object_type: "task", name: "拒绝执行任务", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-reject", title: "拒绝执行任务", status: "draft", approval_status: "pending", execution_status: "not_started" } };
    const reject = vi.fn().mockResolvedValue({ task_id: "task-reject", status: "draft", approval_status: "rejected", execution_status: "not_started" });
    render(<ImplementationWorkspace objects={[linked]} onApproveTaskExecution={vi.fn()} onRejectTaskExecution={reject} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /拒绝执行任务/ }));
    fireEvent.click(screen.getByRole("button", { name: "拒绝" }));
    await vi.waitFor(() => expect(reject).toHaveBeenCalledWith("task-reject"));
    const detail = screen.getByLabelText("对象操作");
    await vi.waitFor(() => expect(screen.getByText("已拒绝执行 · 未开始")).toBeTruthy());
    expect(within(detail).getByText("已驳回")).toBeTruthy();
    expect(within(detail).getByText("未开始")).toBeTruthy();
    expect(screen.queryByText(/执行中|已进入执行/)).toBeNull();
  });

  it("restores approved and rejected TaskAsset execution approval state from reloaded props", () => {
    const approved = { object_id: "object-approved-task", object_type: "task", name: "已批准执行任务", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-approved", title: "已批准执行任务", status: "draft", approval_status: "approved", execution_status: "not_started" } };
    const rejected = { object_id: "object-rejected-task", object_type: "task", name: "已拒绝执行任务", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-rejected", title: "已拒绝执行任务", status: "draft", approval_status: "rejected", execution_status: "not_started" } };
    const { rerender } = render(<ImplementationWorkspace objects={[approved]} onApproveTaskExecution={vi.fn()} onRejectTaskExecution={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /已批准执行任务/ }));
    expect(screen.getByText("已批准执行 · 等待开始执行")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "批准执行" })).toBeNull();
    rerender(<ImplementationWorkspace objects={[rejected]} onApproveTaskExecution={vi.fn()} onRejectTaskExecution={vi.fn()} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /已拒绝执行任务/ }));
    expect(screen.getByText("已拒绝执行 · 未开始")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "批准执行" })).toBeNull();
  });

  it("continues discussion from TaskAsset approval without mutating approval state", () => {
    const linked = { object_id: "object-discuss-task", object_type: "task", name: "继续讨论任务", status: "approved", version: 1, execution_refs: [], task_asset_ref: { task_id: "task-discuss", title: "继续讨论任务", status: "draft", approval_status: "pending", execution_status: "not_started" } };
    const approve = vi.fn(), reject = vi.fn(), discuss = vi.fn();
    render(<ImplementationWorkspace objects={[linked]} onApproveTaskExecution={approve} onRejectTaskExecution={reject} onContinue={discuss} />);
    fireEvent.click(screen.getByRole("button", { name: /继续讨论任务/ }));
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(discuss).toHaveBeenCalledWith(linked);
    expect(approve).not.toHaveBeenCalled();
    expect(reject).not.toHaveBeenCalled();
    const detail = screen.getByLabelText("对象操作");
    expect(within(detail).getByText("待审批")).toBeTruthy();
    expect(within(detail).getByText("未开始")).toBeTruthy();
  });

  it("separates a persisted context object from new draft recognition", () => {
    const context = { object_id: "object-skill", object_type: "skill", name: "Chrome Extension Skill", status: "approved", version: 2, is_context_object: true, execution_refs: [{ status: "draft" }] };
    const draft = { object_id: "object-cap", object_type: "capability", name: "Browser Session", status: "draft", version: 1, revisions: [] };
    render(<ImplementationWorkspace objects={[context, draft]} contextObject={context} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    expect(screen.getByText("当前对象")).toBeTruthy();
    expect(screen.getByText("新增对象 · 等待确认")).toBeTruthy();
    expect(screen.getByText("Capability（能力）")).toBeTruthy();
    expect(screen.getByText("执行：待开发 · V2")).toBeTruthy();
  });

  it("renders and reviews a pending Intent candidate", () => {
    const candidate = { candidate_id: "candidate-1", intent_type: "delay", proposed_object_type: "agent", proposed_name: "广告投放 Agent", proposed_status: "deferred", reason: "当前先不开发", confidence: .94, review_status: "pending" };
    const review = vi.fn(), discuss = vi.fn();
    render(<ImplementationWorkspace candidates={[candidate]} onCandidateReview={review} onCandidateContinue={discuss} />);
    expect(screen.getByRole("heading", { name: "待确认" })).toBeTruthy();
    expect(screen.getByText("待确认", { selector: ".sino-status-chip" })).toBeTruthy();
    expect(screen.getByText(/当前先不开发/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认" }));
    expect(review).toHaveBeenCalledWith(candidate, "confirm");
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(discuss).toHaveBeenCalledWith(candidate);
    fireEvent.click(screen.getByRole("button", { name: "驳回" }));
    expect(review).toHaveBeenCalledWith(candidate, "reject");
  });

  it("prioritizes a pending modification over the approved target and binds execution to the old version", () => {
    const object = { object_id: "object-chrome", object_type: "skill", name: "Chrome Extension Skill", status: "approved", version: 2, execution_refs: [{ execution_id: "exec-1", status: "draft", object_version: 2 }] };
    const candidate = { candidate_id: "candidate-v3", intent_type: "modify", target_object_id: object.object_id, proposed_object_type: "skill", proposed_name: object.name, proposed_description: "增加浏览器数据处理流程", review_status: "pending" };
    render(<ImplementationWorkspace objects={[object]} contextObject={object} candidates={[candidate]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByText("V2 → V3")).toBeTruthy();
    expect(screen.getByText("当前执行版本：V2 · 待开发")).toBeTruthy();
    expect(screen.getByText("待确认", { selector: ".sino-status-chip" })).toBeTruthy();
    expect(screen.queryByText("V2 · 已批准")).toBeNull();
    expect(screen.getByRole("button", { name: "确认" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续讨论" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "驳回" })).toBeTruthy();
  });

  it("returns to the effective approved version after a candidate is rejected", () => {
    const object = { object_id: "object-chrome", object_type: "skill", name: "Chrome Extension Skill", status: "approved", version: 3, execution_refs: [{ status: "draft", object_version: 3 }] };
    const rejected = { candidate_id: "candidate-v4", target_object_id: object.object_id, intent_type: "modify", review_status: "rejected" };
    render(<ImplementationWorkspace objects={[object]} candidates={[rejected]} onApprove={vi.fn()} onContinue={vi.fn()} onArchive={vi.fn()} />);
    expect(screen.getByText("V3 · 已批准")).toBeTruthy();
    expect(screen.getByText("执行：待开发 · V3")).toBeTruthy();
    expect(screen.queryByText("待确认", { selector: ".sino-status-chip" })).toBeNull();
  });

  it("renders confirmed candidates without execution language", () => {
    const candidate = { candidate_id: "candidate-confirmed", conversation_id: "conv-confirmed", intent_type: "create", proposed_object_type: "capability", proposed_name: "Browser Session", proposed_description: "共享浏览器会话能力", review_status: "confirmed", mutation_result: { candidate_confirmed: true, execution_created: false } };
    render(<ImplementationWorkspace candidates={[candidate]} contextCandidate={candidate} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByText("已确认")).toBeTruthy();
    expect(screen.getAllByText("Browser Session").length).toBeGreaterThan(0);
    expect(screen.queryByText(/已进入执行/)).toBeNull();
  });

  it("shows a confirmed DECISION materialized as a draft object", () => {
    const candidate = { candidate_id: "candidate-decision", conversation_id: "conv-decision", intent_type: "create", proposed_object_type: "decision", proposed_name: "第一阶段平台决策", proposed_description: "只支持一个广告平台", review_status: "confirmed", mutation_result: { candidate_confirmed: true, object_id: "object-decision", object_type: "decision", object_version: 1, materialization_action: "create_or_reuse", materialization_status: "draft", task_asset_created: false, execution_created: false } };
    render(<ImplementationWorkspace conversationId="conv-decision" candidates={[candidate]} contextCandidate={candidate} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByText("已确认")).toBeTruthy();
    expect(screen.getByText("已生成正式对象")).toBeTruthy();
    expect(screen.getByText("object-decision")).toBeTruthy();
    const detail = screen.getByLabelText("候选变更操作");
    expect(within(detail).getByText("Decision（决策）")).toBeTruthy();
    expect(within(detail).getByText("草稿")).toBeTruthy();
    expect(screen.queryByText(/已进入执行/)).toBeNull();
  });

  it("shows a confirmed TASK materialized as a draft object without execution language", () => {
    const candidate = { candidate_id: "candidate-task", conversation_id: "conv-task", intent_type: "create", proposed_object_type: "task", proposed_name: "生成落地页 Agent", proposed_description: "做出 Agent", review_status: "confirmed", mutation_result: { candidate_confirmed: true, object_id: "object-task", object_type: "task", object_version: 1, materialization_action: "create_or_reuse", materialization_status: "draft", task_asset_created: false, execution_created: false } };
    render(<ImplementationWorkspace conversationId="conv-task" candidates={[candidate]} contextCandidate={candidate} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByText("已生成正式对象")).toBeTruthy();
    expect(screen.getByText("object-task")).toBeTruthy();
    const detail = screen.getByLabelText("候选变更操作");
    expect(within(detail).getByText("Task（任务）")).toBeTruthy();
    expect(within(detail).getByText("草稿")).toBeTruthy();
    expect(screen.queryByText(/任务已创建|已批准|执行中|已进入执行/)).toBeNull();
  });

  it("does not falsely show object creation for confirmed GOAL candidates", () => {
    const candidate = { candidate_id: "candidate-goal", conversation_id: "conv-goal", intent_type: "create", proposed_object_type: "goal", proposed_name: "长期目标", proposed_description: "暂不支持 goal materialization", review_status: "confirmed", mutation_result: { candidate_confirmed: true, materialization_status: "not_supported", task_asset_created: false, execution_created: false } };
    render(<ImplementationWorkspace conversationId="conv-goal" candidates={[candidate]} contextCandidate={candidate} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByText("已确认")).toBeTruthy();
    expect(screen.queryByText("已生成正式对象")).toBeNull();
    expect(screen.queryByText(/已进入执行/)).toBeNull();
  });

  it("isolates recognition unavailability from the Conversation", () => {
    render(<ImplementationWorkspace recognitionStatus={{ status: "unavailable", error: "DatabaseError" }} />);
    expect(screen.getByText("对象识别暂不可用")).toBeTruthy();
    expect(screen.getByText(/Sino 对话仍可正常继续/)).toBeTruthy();
  });

  it("shows traceable bilingual detail for Discussion to Skill Pipeline", () => {
    const candidate = { candidate_id: "candidate-pipeline", conversation_id: "conv-pipeline", intent_type: "create", proposed_object_type: "capability", proposed_name: "Discussion to Skill Pipeline", proposed_description: "distill discussions", proposed_status: "draft", source_message_refs: ["message-1"], confidence: .8, review_status: "pending" };
    render(<ImplementationWorkspace candidates={[candidate]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /讨论 → Skill 生成管线/ }));
    expect(screen.getAllByText("Discussion to Skill Pipeline").length).toBeGreaterThan(0);
    expect(screen.getByText("candidate-pipeline")).toBeTruthy();
    expect(screen.getByText("conv-pipeline")).toBeTruthy();
    expect(screen.getByText("message-1")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("shows pending candidates for the current conversation only", () => {
    const current = { candidate_id: "candidate-current", conversation_id: "conv-current", intent_type: "create", proposed_object_type: "task", proposed_name: "当前任务候选", proposed_description: "当前会话", source_message_refs: ["message-current"], confidence: .82, review_status: "pending" };
    const other = { candidate_id: "candidate-other", conversation_id: "conv-other", intent_type: "create", proposed_object_type: "task", proposed_name: "其他会话候选", proposed_description: "其他会话", source_message_refs: ["message-other"], confidence: .82, review_status: "pending" };
    render(<ImplementationWorkspace conversationId="conv-current" candidates={[current, other]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByRole("button", { name: /当前任务候选/ })).toBeTruthy();
    expect(screen.queryByText("其他会话候选")).toBeNull();
  });

  it("restores a pending candidate from a reloaded snapshot without implying execution", () => {
    const candidate = { candidate_id: "candidate-restored", conversation_id: "conv-restored", intent_type: "create", candidate_type: "TASK", proposed_object_type: "task", proposed_name: "恢复后的候选", proposed_description: "刷新后仍可审核", source_message_refs: ["message-restored"], confidence: .82, review_status: "pending" };
    render(<ImplementationWorkspace conversationId="conv-restored" candidates={[candidate]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "待确认" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /恢复后的候选/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "确认" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "继续讨论" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "驳回" })).toBeTruthy();
    expect(screen.queryByText(/已进入执行/)).toBeNull();
  });

  it("hides pending review after confirm or reject reload state", () => {
    const pending = { candidate_id: "candidate-review", conversation_id: "conv-review", intent_type: "create", proposed_object_type: "task", proposed_name: "审核候选", proposed_description: "等待确认", source_message_refs: ["message-review"], confidence: .82, review_status: "pending" };
    const { rerender } = render(<ImplementationWorkspace conversationId="conv-review" candidates={[pending]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getByRole("button", { name: /审核候选/ })).toBeTruthy();
    rerender(<ImplementationWorkspace conversationId="conv-review" candidates={[{ ...pending, review_status: "confirmed", mutation_result: { candidate_confirmed: true, execution_created: false } }]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /审核候选/ })).toBeNull();
    expect(screen.queryByText("待确认", { selector: ".sino-status-chip" })).toBeNull();
    expect(screen.queryByText(/已进入执行/)).toBeNull();
    rerender(<ImplementationWorkspace conversationId="conv-review" candidates={[{ ...pending, review_status: "rejected" }]} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /审核候选/ })).toBeNull();
    expect(screen.queryByText("待确认", { selector: ".sino-status-chip" })).toBeNull();
  });

  it("keeps continue discussion as a pending candidate action", () => {
    const candidate = { candidate_id: "candidate-discuss", conversation_id: "conv-discuss", intent_type: "create", proposed_object_type: "task", proposed_name: "继续讨论候选", proposed_description: "继续当前会话讨论", source_message_refs: ["message-discuss"], confidence: .82, review_status: "pending" };
    const review = vi.fn(), discuss = vi.fn();
    render(<ImplementationWorkspace conversationId="conv-discuss" candidates={[candidate]} onCandidateReview={review} onCandidateContinue={discuss} />);
    fireEvent.click(screen.getByRole("button", { name: "继续讨论" }));
    expect(discuss).toHaveBeenCalledWith(candidate);
    expect(review).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /继续讨论候选/ })).toBeTruthy();
  });

  it("renders the same pending candidate once when reload data contains duplicates", () => {
    const candidate = { candidate_id: "candidate-once", conversation_id: "conv-once", intent_type: "create", proposed_object_type: "task", proposed_name: "唯一候选", proposed_description: "重复数据只显示一次", source_message_refs: ["message-once"], confidence: .82, review_status: "pending" };
    render(<ImplementationWorkspace conversationId="conv-once" candidates={[candidate, { ...candidate }]} contextCandidate={{ ...candidate }} onCandidateReview={vi.fn()} onCandidateContinue={vi.fn()} />);
    expect(screen.getAllByRole("button", { name: /唯一候选/ })).toHaveLength(1);
  });
});
