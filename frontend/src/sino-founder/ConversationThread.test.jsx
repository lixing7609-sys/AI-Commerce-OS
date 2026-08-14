// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConversationThread, normalizeDisplayText, normalizeTextList } from "./ConversationThread.jsx";

const snapshot = (id, messages) => ({ conversation: { id }, messages });
afterEach(() => cleanup());

describe("ConversationThread layout", () => {
  it("normalizes strings, arrays, objects and null display values", () => {
    expect(normalizeDisplayText(null)).toBe("");
    expect(normalizeDisplayText(["一", { content: "二" }])).toBe("一；二");
    expect(normalizeDisplayText({ first: "一", second: true })).toBe("first：一；second：true");
    expect(normalizeTextList("单项")).toEqual(["单项"]);
    expect(normalizeTextList({ reason: "对象原因" })).toEqual(["对象原因"]);
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
    fireEvent.submit(screen.getByPlaceholderText("和 Sino 讨论任何想法、问题、战略或设计……").closest("form"));
    rerender(<ConversationThread snapshot={snapshot("conv-history", [{ message_id: "m1", role: "founder", content: "较早消息" }, { message_id: "m2", role: "assistant", content: "新回复" }])} message="" onMessage={vi.fn()} onSend={onSend} busy={false} />);
    expect(log.scrollTop).toBe(100);
  });

  it("renders and expands persisted answer grounding without exposing unused unscoped project sources", () => {
    const grounding = { schema_version: 1, sources: [
      { key: "living_prompt", label: "动态提示词", available: true, used: true, version: "v2", references: [{ source_id: "project-1", title: "AI Commerce OS" }] },
      { key: "knowledge", label: "项目知识", available: true, used: true, count: 3 },
      { key: "constraints", label: "项目约束", available: true, used: false, count: 0 },
      { key: "current_conversation", label: "当前会话", available: true, used: true, count: 2 },
      { key: "founder_current_message", label: "Founder 当前输入", available: true, used: true, count: 1 },
      { key: "external_model_knowledge", label: "模型通用知识", available: true, used: true },
    ] };
    render(<ConversationThread snapshot={snapshot("conv-grounded", [{ message_id: "m1", role: "assistant", content: "基于项目上下文回答。", grounding }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    const summary = screen.getByText("本次依据").closest("summary");
    expect(summary.textContent).toContain("动态提示词 v2 · 项目知识 · 当前会话");
    fireEvent.click(summary);
    expect(screen.getByText("3 条")).toBeTruthy();
    expect(screen.getByText("未引用")).toBeTruthy();
    expect(screen.getByText("AI Commerce OS")).toBeTruthy();
  });

  it("shows only real non-project grounding for an unscoped reply", () => {
    const grounding = { schema_version: 1, sources: [
      { key: "living_prompt", label: "动态提示词", available: false, used: false },
      { key: "knowledge", label: "项目知识", available: false, used: false, count: 0 },
      { key: "current_conversation", label: "当前会话", available: true, used: true, count: 1 },
      { key: "founder_current_message", label: "Founder 当前输入", available: true, used: true, count: 1 },
      { key: "external_model_knowledge", label: "模型通用知识", available: true, used: true },
    ] };
    render(<ConversationThread snapshot={snapshot("conv-unscoped", [{ message_id: "m1", role: "assistant", content: "通用回答。", grounding }])} message="" onMessage={vi.fn()} onSend={vi.fn()} busy={false} />);
    expect(screen.getByText("本次依据").closest("summary").textContent).toContain("当前会话 · Founder 当前输入 · 模型通用知识");
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
});
