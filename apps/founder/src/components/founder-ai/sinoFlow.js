import { STAGES } from "./conversationStore.js";
import { buildDecisionDraft } from "./decisionService.js";
import { buildTaskPackage } from "./taskPackageService.js";
import {
  startExecutionRun,
  pollExecutionRun,
  submitExecutionInput,
  cancelExecutionRun,
  buildMockFailureResult,
  buildRunState,
} from "./executorAdapter.js";
import { buildReview } from "./reviewService.js";
import { buildRetrospective, buildKnowledgeEntry } from "./knowledgeService.js";
import { brainComplete, previewTaskPackage } from "./connectorApi.js";

// 把 Sino 的整套"整理 → 论证 → 多模型 → 待决策 → 批准 → 任务包 → 执行 →
// 验收 → 复盘 → 知识沉淀"流程集中在一处，供 FounderConversation（渲染
// 时间线 + 输入框）和 SinoPanel（渲染右侧下一步按钮）共用同一套 handler，
// 避免把流程逻辑拆散到多个组件里各写一份。
//
// 讨论分析（handleSend）由 Founder Context Builder + GPT Brain 完成 ——
// 通过 connectorApi 调用本地 backend 的 Sino Connector（domain=founder，
// 只组装当前 Founder 对话需要的信息），不再使用纯前端关键词规则。
// backend 未配置 OPENAI_API_KEY 或调用失败时，会返回 mock:true /
// parse_error，这里必须把这个状态原样标注给用户，不能假装是真实分析。
//
// 执行（handleTaskPackageAction "assign" / handleReviewAction "revise"）
// 同理通过 executorAdapter 调用真实 Claude Code CLI，只有 Executor 本身
// 不可用时才降级为标注了 mock:true 的失败结果。
//
// 这是一个普通工厂函数而不是 React hook（内部不调用任何 hook）——每个
// handler 显式接收目标 conversation，而不是从闭包里的某个 state 变量读取。
// 这样"新建对话并立即发送种子文本"（技术雷达/时间线的"与 Sino 讨论"）
// 可以在同一个事件处理函数里同步完成，不需要额外一次渲染。
export function createSinoFlow(conv, founderAI) {
  function extractTexts(items) {
    return (items || []).map((item) => (typeof item === "string" ? item : item.text));
  }

  function buildRecentMessages(conversation) {
    return conversation.messages
      .filter((m) => m.type === "user" || m.type === "sino")
      .filter((m) => !m.pending)
      .slice(-12)
      .map((m) => ({ role: m.type === "user" ? "user" : "sino", text: m.text || "" }));
  }

  async function handleSend(conversation, text, { attachments = [], webSearch = false } = {}) {
    if (!conversation) return;
    const trimmed = text.trim();
    if (!trimmed && attachments.length === 0) return;
    const displayText = trimmed || (attachments[0] ? `[附件] ${attachments[0].name}` : "");

    conv.appendMessage(conversation.id, { type: "user", text: displayText, attachments, webSearch });

    const thinkingConv = conv.appendMessage(conversation.id, {
      type: "sino",
      text: "Sino 正在思考…",
      pending: true,
    });
    const thinkingEntry = thinkingConv.messages[thinkingConv.messages.length - 1];

    let response;
    try {
      response = await brainComplete({
        conversationId: conversation.id,
        message: displayText,
        sinoState: {
          topic: conversation.topic,
          stage: conversation.stage,
          consensus: extractTexts(conversation.consensus),
          pendingConfirmations: extractTexts(conversation.pendingConfirmations),
          rejected: extractTexts(conversation.rejected),
          constraints: extractTexts(conversation.constraints),
        },
        recentMessages: buildRecentMessages(conversation),
        knowledge: [],
      });
    } catch (error) {
      conv.updateMessage(conversation.id, thinkingEntry.id, {
        text: `[无法连接 Sino Connector 后端] ${error.message}，请确认本地 backend 是否已启动。`,
        pending: false,
      });
      return;
    }

    if (response.mock) {
      conv.updateMessage(conversation.id, thinkingEntry.id, {
        text: `[Mock · GPT Brain 未配置] ${response.error_message || "未配置 OPENAI_API_KEY，已安全降级。"}`,
        pending: false,
        mock: true,
      });
      return;
    }

    const isFirstMessage = conversation.messages.filter((m) => m.type === "user").length <= 1;
    const statePatch = {};
    if (response.topic_update) statePatch.topic = response.topic_update;
    else if (isFirstMessage && !conversation.topic) {
      statePatch.topic = trimmed.length > 22 ? `${trimmed.slice(0, 22)}…` : trimmed;
    }
    if (isFirstMessage && conversation.stage === STAGES.IDLE) {
      statePatch.stage = STAGES.EXPLORATION;
    }
    if (response.stage_suggestion) statePatch.stage = response.stage_suggestion;

    if (response.ready_for_decision) {
      statePatch.suggestion = { text: "当前核心结论已经较完整，建议形成待决策。", kind: "form-decision" };
    } else if (response.suggest_invite_other_models) {
      statePatch.suggestion = { text: "当前问题仍存在关键分歧，建议邀请其他模型参与。", kind: "multi-model" };
    } else {
      statePatch.suggestion = null;
    }

    conv.updateState(conversation.id, statePatch);
    if (response.consensus_add?.length) conv.addStateItems(conversation.id, "consensus", response.consensus_add);
    if (response.pending_add?.length) conv.addStateItems(conversation.id, "pendingConfirmations", response.pending_add);
    if (response.rejected_add?.length) conv.addStateItems(conversation.id, "rejected", response.rejected_add);
    if (response.constraint_add?.length) conv.addStateItems(conversation.id, "constraints", response.constraint_add);

    conv.updateMessage(conversation.id, thinkingEntry.id, {
      text: response.parse_error
        ? `[Sino 提示：模型输出解析失败，已展示原始回复]\n${response.reply}`
        : response.reply,
      pending: false,
      connectorRunId: response.connector_run_id,
    });
  }

  function handleNextAction(conversation, key) {
    if (!conversation) return;
    if (key === "invite-models") {
      conv.updateState(conversation.id, { stage: STAGES.MULTI_MODEL, suggestion: null });
      conv.appendMessage(conversation.id, {
        type: "sino",
        text: "多模型讨论功能仍在建设中（V1 阶段仅接入 GPT 作为 Brain）。我会继续以 GPT 的分析为准，你可以直接告诉我你的判断。",
      });
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
      conv.updateState(conversation.id, { stage: STAGES.DECISION, suggestion: null });
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
      conv.updateState(conversation.id, { stage: STAGES.KNOWLEDGE });
    }
  }

  async function handleDecisionAction(conversation, messageId, action) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry) return;
    if (action === "approve") {
      founderAI.resolvePendingDecision(entry.globalId, "approve");
      conv.updateMessage(conversation.id, messageId, { resolved: "approved" });
      conv.updateState(conversation.id, { stage: STAGES.APPROVED });
      const pkg = buildTaskPackage(conversation, entry.decision);

      try {
        const preview = await previewTaskPackage({
          conversationId: conversation.id,
          decisionId: entry.globalId,
          taskPackage: pkg,
        });
        pkg.taskPackageId = preview.task_package_id;
        pkg.connectorRunId = preview.connector_run_id;
      } catch (error) {
        pkg.taskPackageId = `tp-local-${Date.now()}`;
        pkg.registrationError = error.message;
      }

      conv.appendMessage(conversation.id, {
        type: "task-package",
        pkg,
        assigned: false,
        decisionId: entry.globalId,
      });
    } else if (action === "reject") {
      founderAI.resolvePendingDecision(entry.globalId, "reject");
      conv.updateMessage(conversation.id, messageId, { resolved: "rejected" });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENTATION });
      conv.appendMessage(conversation.id, { type: "sino", text: "已驳回，我们可以继续讨论调整方向。" });
    } else if (action === "continue") {
      conv.updateMessage(conversation.id, messageId, { resolved: "continue" });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENTATION });
      conv.appendMessage(conversation.id, { type: "sino", text: "好的，我们继续讨论。" });
    } else if (action === "revise") {
      conv.updateMessage(conversation.id, messageId, { resolved: "revise" });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENTATION });
      conv.appendMessage(conversation.id, { type: "sino", text: "好的，告诉我需要修改哪部分结论。" });
    }
  }

  // 启动一次真实执行并开始轮询，onUpdate 由调用方决定写到哪条时间线
  // 消息上（初次分配 vs. 验收后"继续修改"共用这同一个函数）。
  async function runExecution(conversation, { taskPackageId, taskPackage, decisionId, pkgName }) {
    const execConversation = conv.appendMessage(conversation.id, {
      type: "execution",
      run: buildRunState({ taskName: pkgName, currentStep: "正在连接 Claude Code Executor…", status: "starting" }),
      result: null,
      reviewVerdict: null,
      pkgName,
    });
    const execEntry = execConversation.messages[execConversation.messages.length - 1];

    let started;
    try {
      started = await startExecutionRun({
        conversationId: conversation.id,
        decisionId: decisionId || null,
        taskPackageId: taskPackageId || `tp-local-${Date.now()}`,
        taskPackage,
      });
    } catch (error) {
      const health = error.detail?.detail?.health;
      conv.updateMessage(conversation.id, execEntry.id, {
        run: buildRunState({ taskName: pkgName, status: "failed", currentStep: "无法启动 Claude Code Executor" }),
        result: buildMockFailureResult(error, health),
      });
      conv.updateState(conversation.id, { stage: STAGES.REVIEW });
      return;
    }

    conv.updateMessage(conversation.id, execEntry.id, {
      run: buildRunState({
        taskName: pkgName,
        runId: started.runId,
        status: started.status,
        mock: started.mock,
        currentStep: "Claude Code 已启动，正在执行",
      }),
    });

    pollExecutionRun(started.runId, {
      onUpdate: (patch) => {
        conv.updateMessage(conversation.id, execEntry.id, { ...patch, run: { ...patch.run, taskName: pkgName } });
        if (patch.result) conv.updateState(conversation.id, { stage: STAGES.REVIEW });
      },
    });
  }

  function handleTaskPackageAction(conversation, messageId, action) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry) return;
    if (action === "assign") {
      conv.updateMessage(conversation.id, messageId, { assigned: true });
      conv.updateState(conversation.id, { stage: STAGES.EXECUTION });
      runExecution(conversation, {
        taskPackageId: entry.pkg.taskPackageId,
        taskPackage: entry.pkg,
        decisionId: entry.decisionId || null,
        pkgName: entry.pkg.name,
      });
    } else if (action === "back") {
      conv.updateMessage(conversation.id, messageId, { assigned: false });
      conv.updateState(conversation.id, { stage: STAGES.ARGUMENTATION });
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
      conv.updateState(conversation.id, { stage: STAGES.EXECUTION });
      conv.appendMessage(conversation.id, {
        type: "sino",
        text: "好的，我会带着这次执行的结果生成一个增量修改任务（V1 阶段为新任务包 + 携带上一次执行摘要，暂不复用同一个 Claude 会话）。",
      });
      const incrementalPkg = {
        ...(entry.result || {}),
        name: `${entry.pkgName}（增量修改）`,
        background: `对「${entry.pkgName}」的验收反馈：${verdict}。`,
        currentProblem: `上一次执行摘要：${entry.result?.summary || "无"}；已知问题：${entry.result?.knownIssues || "无"}。`,
        confirmedConclusions: [],
        rejectedApproaches: [],
        prohibitions: [],
        scope: entry.pkg?.scope || "Founder AI 页面",
        uiReference: entry.pkg?.uiReference || "沿用当前设计系统",
        codeImpact: entry.pkg?.codeImpact || "上一次执行涉及的文件：" + (entry.result?.filesChanged || []).join("；"),
        acceptanceCriteria: ["按用户本轮反馈修正上一次执行结果"],
        testRequirements: "lint + build + 浏览器逐项点击验证",
        pageViewRequirement: "必须提供可直接打开的本地页面地址",
        gitRequirement: "创建新 commit，不使用 --amend",
        taskPackageId: `tp-revise-${Date.now()}`,
      };
      runExecution(conversation, {
        taskPackageId: incrementalPkg.taskPackageId,
        taskPackage: incrementalPkg,
        pkgName: incrementalPkg.name,
      });
    } else if (verdict === "reject") {
      conv.updateState(conversation.id, { stage: STAGES.APPROVED });
      conv.appendMessage(conversation.id, { type: "sino", text: "已驳回本次执行结果，可以重新调整任务包后再次分配。" });
    }
  }

  async function handleExecutionInput(conversation, messageId, answer) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry?.run?.runId) return;
    conv.updateMessage(conversation.id, messageId, {
      run: { ...entry.run, awaitingInput: false, currentStep: "已提交回答，继续执行" },
    });
    try {
      await submitExecutionInput(entry.run.runId, answer);
    } catch (error) {
      conv.updateMessage(conversation.id, messageId, {
        run: { ...entry.run, currentStep: `提交回答失败：${error.message}` },
      });
      return;
    }
    pollExecutionRun(entry.run.runId, {
      onUpdate: (patch) => {
        conv.updateMessage(conversation.id, messageId, { ...patch, run: { ...patch.run, taskName: entry.run.taskName } });
        if (patch.result) conv.updateState(conversation.id, { stage: STAGES.REVIEW });
      },
    });
  }

  async function handleExecutionCancel(conversation, messageId) {
    const entry = conversation.messages.find((m) => m.id === messageId);
    if (!entry?.run?.runId) return;
    try {
      await cancelExecutionRun(entry.run.runId);
    } catch (error) {
      conv.updateMessage(conversation.id, messageId, {
        run: { ...entry.run, currentStep: `取消失败：${error.message}` },
      });
      return;
    }
    conv.updateMessage(conversation.id, messageId, {
      run: { ...entry.run, status: "cancelled", awaitingInput: false, currentStep: "已取消" },
      result: {
        summary: "执行已取消",
        pageUrl: null,
        filesChanged: [],
        testResults: "—",
        knownIssues: "—",
        status: "cancelled",
      },
    });
    conv.updateState(conversation.id, { stage: STAGES.REVIEW });
  }

  return {
    handleSend,
    handleNextAction,
    handleDecisionAction,
    handleTaskPackageAction,
    handleReviewAction,
    handleExecutionInput,
    handleExecutionCancel,
  };
}
