// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArchitectureProposalCard, ConversationThread, normalizeDisplayText, normalizeTextList } from "./ConversationThread.jsx";

const snapshot = (id, messages) => ({ conversation: { id }, messages });
afterEach(() => cleanup());

describe("ConversationThread layout", () => {
  it("keeps an Architecture task in Conversation and leaves its action to the right rail", () => {
    const route = { classification: "STRATEGIC_TASK", task_type: "ARCHITECTURE_TASK", current_step: "decision_readiness", architecture_proposal: { proposal_id: "proposal-v1", proposal_version: 1, status: "ready_for_founder_decision", current_problem: "Boundary unclear", proposed_boundary: "Founder owns definitions; Studio consumes Ready references.", founder_responsibilities: ["Validate"], studio_responsibilities: ["Execute Ready"], capability_lifecycle: ["candidate", "ready"], binding_contract: { reference: "id + version", consumer_rule: "ready_only" }, learning_feedback: "Return evidence", migration_impact: ["Preserve IDs"], risks: ["Drift"], recommended_decision: "Approve boundary" } };
    const value = { ...snapshot("conv-architecture", [{ message_id: "m1", role: "founder", content: "重新设计 Founder 与 Studio Capability 供给关系" }]), sino_brain: { stage: "decision_ready", active_workspace_stage: "decision_readiness", source_message_refs: ["m1"], stage_workspaces: [{ stage_key: "decision_readiness", label: "Decision Readiness", status: "active", message_refs: ["m1"] }], discovery: { task_complexity_route: route }, current_action: { title: "等待 Founder 决策", primary_label: null } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("重新设计 Founder 与 Studio Capability 供给关系")).toBeTruthy();
    expect(screen.queryByRole("article", { name: "Architecture Proposal" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Standard Task 流程" })).toBeNull();
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
  it("projects an autonomously completed Quick Fix at the Completed step", () => {
    const value = snapshot("quick-complete", [{ message_id: "m1", role: "founder", content: "修复折叠" }]);
    value.sino_brain = { source_message_refs: ["m1"], active_workspace_stage: "issue", discovery: { task_complexity_route: { classification: "QUICK_FIX", execution_status: "completed", evidence: {} } } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByLabelText("讨论记录").dataset.stageWorkspace).toBe("完成");
    expect(screen.queryByText("Strategy Meeting")).toBeNull();
  });
  it("never exposes Continue while a clear Quick Fix is progressing autonomously", () => {
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
  it("keeps one Project Planning primary action in the workspace", () => {
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
  it("shows the locked Cognitive Work target while autonomous analysis is running", () => {
    const value = { ...snapshot("cognitive-running", [{ message_id: "m1", role: "assistant", content: "上一轮结果" }]), sino_brain: { stage: "project_planning", active_workspace_stage: "goal", discovery: { discussion_maturity: { maturity_status: "continue_analysis", autonomous_next_analysis: "完成治理边界定义" }, cognitive_work_run: { run_id: "run-1", work_target: "完成治理边界定义", run_status: "running" } }, stage_workspaces: [{ stage_id: "planning:goal", stage_key: "goal", label: "Project Planning", status: "active", message_refs: ["m1"] }] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy onContinueProjectAnalysis={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Sino 正在执行" })).toBeTruthy();
    expect(screen.getByText("完成治理边界定义")).toBeTruthy();
    expect(screen.getByText("分析中")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "继续分析" })).toBeNull();
  });
  it("projects a blocking maturity judgment as Founder input without a continue action", () => {
    const value = { ...snapshot("blocking-planning", [{ message_id: "message-1", role: "assistant", content: "当前分析" }]), sino_brain: { stage: "project_planning", active_workspace_stage: "goal", current_action: { action_id: "answer_project_question", title: "需要 Founder 判断", description: "边界选择待确认", primary_label: "回答关键问题" }, discovery: { discussion_maturity: { maturity_status: "founder_input_required", reason: "该选择会改变系统边界。", blocking_question: "是否允许跨业务域共享学习结果？", why_founder_needed: "这属于 Founder 的产品治理权限。", sino_recommendation: "首版保持域内隔离。", recommendation_reason: "避免错误学习跨域传播。" } }, stage_workspaces: [{ stage_id: "planning:goal", stage_key: "goal", label: "Project Planning", status: "active", message_refs: ["message-1"] }] } };
    render(<ConversationThread snapshot={value} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByRole("heading", { name: "需要 Founder 判断" })).toBeTruthy();
    expect(screen.getByText(/为什么需要 Founder：这属于 Founder 的产品治理权限/)).toBeTruthy();
    expect(screen.getByText(/Sino 建议：首版保持域内隔离/)).toBeTruthy();
    expect(screen.getByText(/建议理由：避免错误学习跨域传播/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /继续分析|回答关键问题/ })).toBeNull();
  });
  it("drops resolved blocker content from the latest Current Action projection", () => {
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

  it("follows a material Current Action update while Founder remains near latest", () => {
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

  it("renders one stateful Goal Brief card and suppresses repeated brief messages", () => {
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

  it("isolates messages by stage and restores the current Strategy workspace", () => {
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

  it("locks future stages and disables auto deliberation outside Strategy", () => {
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

  it("offers real reuse only for Ready assets and development for Candidate assets", () => {
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
