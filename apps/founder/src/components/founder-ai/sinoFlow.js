import { STAGES } from "./conversationStore.js";
import { analyzeUserMessage, buildMultiModelDiscussion } from "./sinoAnalysisService.js";
import { buildDecisionDraft } from "./decisionService.js";
import { buildTaskPackage } from "./taskPackageService.js";
import { assignToClaudeCode, simulateExecutionResult } from "./executorAdapter.js";
import { buildReview } from "./reviewService.js";
import { buildRetrospective, buildKnowledgeEntry } from "./knowledgeService.js";

// 把 Sino 的整套"整理 → 论证 → 多模型 → 待决策 → 批准 → 任务包 → 执行 →
// 验收 → 复盘 → 知识沉淀"流程集中在一处，供 FounderConversation（渲染
// 时间线 + 输入框）和 SinoPanel（渲染右侧下一步按钮）共用同一套 handler，
// 避免把流程逻辑拆散到多个组件里各写一份。
//
// 这是一个普通工厂函数而不是 React hook（内部不调用任何 hook）——每个
// handler 显式接收目标 conversation，而不是从闭包里的某个 state 变量读取。
// 这样"新建对话并立即发送种子文本"（技术雷达/时间线的"与 Sino 讨论"）
// 可以在同一个事件处理函数里同步完成，不需要额外一次渲染。
export function createSinoFlow(conv, founderAI) {
  function handleSend(conversation, text, { attachments = [], webSearch = false } = {}) {
    if (!conversation) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    const displayText = trimmed || (attachments[0] ? `[附件] ${attachments[0].name}` : "");

    conv.appendMessage(conversation.id, { type: "user", text: displayText, attachments, webSearch });

    const analysis = analyzeUserMessage(conversation, displayText);
    const statePatch = {};
    if (analysis.topic) statePatch.topic = analysis.topic;
    if (analysis.stage) statePatch.stage = analysis.stage;
    statePatch.suggestion = analysis.suggestion || null;
    conv.updateState(conversation.id, statePatch);

    if (analysis.consensusAdd) conv.addStateItems(conversation.id, "consensus", analysis.consensusAdd);
    if (analysis.pendingAdd) conv.addStateItems(conversation.id, "pendingConfirmations", analysis.pendingAdd);
    if (analysis.rejectedAdd) conv.addStateItems(conversation.id, "rejected", analysis.rejectedAdd);
    if (analysis.constraintAdd) conv.addStateItems(conversation.id, "constraints", analysis.constraintAdd);

    conv.appendMessage(conversation.id, { type: "sino", text: analysis.sinoReply });
  }

  function handleNextAction(conversation, key) {
    if (!conversation) return;
    if (key === "invite-models") {
      const block = buildMultiModelDiscussion(conversation);
      conv.updateState(conversation.id, { stage: STAGES.MULTI_MODEL, suggestion: null });
      conv.appendMessage(conversation.id, { type: "multi-model", ...block });
      return;
    }
    if (key === "form-decision") {
      const decision = buildDecisionDraft(conversation);
      const globalRecord = founderAI.addPendingDecision({
        title: decision.title,
        source: "Sino 对话",
        reason: decision.background,
        impact: decision.constraints.join("；") || "无",
        expectedBenefit: decision.conclusion.join("；") || "无",
        aiSuggestion: decision.sinoSuggestion,
        riskLevel: decision.risk,
      });
      conv.updateState(conversation.id, { stage: STAGES.PENDING_DECISION, suggestion: null });
      conv.appendMessage(conversation.id, { type: "decision-draft", decision, resolved: null, globalId: globalRecord.id });
      return;
    }
    if (key === "start-retrospective") {
      const retro = buildRetrospective(conversation);
      founderAI.addRetrospective(retro);
      conv.appendMessage(conversation.id, { type: "retrospective", retro });
      return;
    }
    if (key === "save-knowledge") {
      const retroEntry = [...conversation.messages].reverse().find((m) => m.type === "retrospective");
      const entry = buildKnowledgeEntry(conversation, retroEntry?.retro || buildRetrospective(conversation));
      founderAI.addKnowledgeEntry(entry);
      conv.appendMessage(conversation.id, { type: "knowledge", entry });
      conv.updateState(conversation.id, { stage: STAGES.ARCHIVED });
    }
  }

  function handleDecisionAction(conversation, messageId, action) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry) return;
    if (action === "approve") {
      founderAI.resolvePendingDecision(entry.globalId, "approve");
      conv.updateMessage(conversation.id, messageId, { resolved: "approved" });
      conv.updateState(conversation.id, { stage: STAGES.APPROVED });
      const pkg = buildTaskPackage(conversation, entry.decision);
      conv.appendMessage(conversation.id, { type: "task-package", pkg, assigned: false });
    } else if (action === "reject") {
      founderAI.resolvePendingDecision(entry.globalId, "reject");
      conv.updateMessage(conversation.id, messageId, { resolved: "rejected" });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENT });
      conv.appendMessage(conversation.id, { type: "sino", text: "已驳回，我们可以继续讨论调整方向。" });
    } else if (action === "continue") {
      conv.updateMessage(conversation.id, messageId, { resolved: "continue" });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENT });
      conv.appendMessage(conversation.id, { type: "sino", text: "好的，我们继续讨论。" });
    } else if (action === "revise") {
      conv.updateMessage(conversation.id, messageId, { resolved: "revise" });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENT });
      conv.appendMessage(conversation.id, { type: "sino", text: "好的，告诉我需要修改哪部分结论。" });
    }
  }

  function handleTaskPackageAction(conversation, messageId, action) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry) return;
    if (action === "assign") {
      conv.updateMessage(conversation.id, messageId, { assigned: true });
      conv.updateState(conversation.id, { stage: STAGES.EXECUTING });
      const run = assignToClaudeCode(entry.pkg);
      const execConversation = conv.appendMessage(conversation.id, {
        type: "execution",
        run,
        result: null,
        reviewVerdict: null,
        pkgName: entry.pkg.name,
      });
      const execEntry = execConversation.messages[execConversation.messages.length - 1];
      window.setTimeout(() => {
        const result = simulateExecutionResult(entry.pkg);
        conv.updateMessage(conversation.id, execEntry.id, { result });
        conv.updateState(conversation.id, { stage: STAGES.AWAITING_REVIEW });
      }, 1400);
    } else if (action === "back") {
      conv.updateMessage(conversation.id, messageId, { assigned: false });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENT });
    }
  }

  function handleReviewAction(conversation, messageId, verdict) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry) return;
    const review = buildReview(verdict);
    conv.updateMessage(conversation.id, messageId, { reviewVerdict: review });
    if (verdict === "pass") {
      conv.updateState(conversation.id, { stage: STAGES.RETROSPECTIVE });
      conv.appendMessage(conversation.id, { type: "sino", text: "验收通过。是否开始本次复盘？" });
    } else if (verdict === "revise") {
      conv.updateState(conversation.id, { stage: STAGES.EXECUTING });
      conv.appendMessage(conversation.id, {
        type: "sino",
        text: "好的，我会带着这次的上下文生成一个增量修改任务，不重新开一套新任务。",
      });
      const run = assignToClaudeCode({ name: `${entry.pkgName}（增量修改）` });
      const execConversation = conv.appendMessage(conversation.id, {
        type: "execution",
        run,
        result: null,
        reviewVerdict: null,
        pkgName: `${entry.pkgName}（增量修改）`,
      });
      const execEntry = execConversation.messages[execConversation.messages.length - 1];
      window.setTimeout(() => {
        const result = simulateExecutionResult({ name: `${entry.pkgName}（增量修改）` });
        conv.updateMessage(conversation.id, execEntry.id, { result });
        conv.updateState(conversation.id, { stage: STAGES.AWAITING_REVIEW });
      }, 1400);
    } else if (verdict === "reject") {
      conv.updateState(conversation.id, { stage: STAGES.APPROVED });
      conv.appendMessage(conversation.id, { type: "sino", text: "已驳回本次执行结果，可以重新调整任务包后再次分配。" });
    }
  }

  return { handleSend, handleNextAction, handleDecisionAction, handleTaskPackageAction, handleReviewAction };
}
