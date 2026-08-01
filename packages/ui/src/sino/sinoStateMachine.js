// Sino 状态机 —— 与具体人格（Founder/Studio/Growth/Operator）无关的纯逻辑。
// 只依赖调用方传入的普通数据（当前阶段、消息文本、已积累的共识/待确认/
// 已否决/关键约束数量），不依赖任何 React、Context 或某个 App 的数据模型，
// 所以可以被所有 Sino 人格共用：各自的对话存储/UI 只需要调用这里的纯函数，
// 把返回结果落地成自己的状态更新即可。
//
// 当前用关键词规则模拟"实时整理"，返回结构与未来接入真实模型判断的接口
//保持一致 —— 替换时只需要换掉 classifySinoMessage 的实现，调用方不需要变。

export const SINO_STAGES = {
  IDLE: "尚未开始",
  EXPLORATION: "探索",
  ARGUMENTATION: "功能论证",
  MULTI_MODEL: "多模型讨论",
  DECISION: "待决策",
  APPROVED: "已批准",
  EXECUTION: "执行中",
  REVIEW: "待验收",
  RETROSPECTIVE: "复盘中",
  KNOWLEDGE: "已沉淀",
};

// 至少积累这么多条共识/待确认/已否决/关键约束，才认为讨论"较完整"，
// Sino 才会主动建议邀请其他模型或形成待决策 —— 避免用户还没说几句话，
// 右侧就冒出一堆推进按钮。
const SUBSTANTIVE_THRESHOLD = 2;

/**
 * 根据一条新的用户消息，判断 Sino 应该如何更新状态。
 * @param {{isFirstMessage: boolean, stage: string, text: string}} input
 * @returns {{topic?: string, stage?: string, sinoReply: string, suggestion?: object,
 *            consensusAdd?: string[], pendingAdd?: string[], rejectedAdd?: string[], constraintAdd?: string[]}}
 */
export function classifySinoMessage({ isFirstMessage, stage, text }) {
  const trimmed = (text || "").trim();

  if (isFirstMessage) {
    return {
      topic: trimmed.length > 22 ? `${trimmed.slice(0, 22)}…` : trimmed,
      stage: SINO_STAGES.EXPLORATION,
      sinoReply: "我先记录下这个方向。我们可以继续深入讨论，我会逐步帮你理清共识、待确认的问题和关键约束。",
    };
  }

  const result = {};

  if (/保留.{0,4}顶部.{0,4}导航/.test(trimmed) && /左侧/.test(trimmed) && /右侧/.test(trimmed) && /Sino/i.test(trimmed)) {
    result.consensusAdd = ["保留现有顶部导航", "左侧采用 GPT 式对话记录", "右侧命名为 Sino"];
    result.sinoReply = "已记录，这几点已经形成共识，可以在右侧「已形成共识」里查看。";
  } else if (/(运行引擎|引擎状态|底层.{0,4}引擎)/.test(trimmed) && /不要显示|不显示|去掉/.test(trimmed)) {
    result.constraintAdd = ["主界面不得展示底层运行引擎"];
    result.sinoReply = "明白，我把这一点记为关键约束，后续任何页面改动都不能违反。";
  } else if (/完全同意|非常同意|全部同意/.test(trimmed)) {
    result.sinoReply = "当前核心结论已经较完整，建议形成待决策。";
    result.suggestion = { text: "当前核心结论已经较完整，建议形成待决策。", kind: "form-decision" };
  } else if (/其他模型|多个模型|模型.{0,4}讨论|换个模型/.test(trimmed)) {
    result.sinoReply = "好的，我来邀请其他模型一起看看这个问题。";
    result.suggestion = { text: "当前问题仍存在关键分歧，建议邀请其他模型参与。", kind: "multi-model" };
  } else if (/不同意|不行|否决|不采用|算了/.test(trimmed)) {
    result.rejectedAdd = [trimmed];
    result.sinoReply = "好的，这个方向先否决，已经记录下来。";
  } else if (/不要|不能|禁止|不允许|必须/.test(trimmed)) {
    result.constraintAdd = [trimmed];
    result.sinoReply = "明白，我把这一点记为关键约束。";
  } else if (/同意|没问题|可以|认可|没意见/.test(trimmed)) {
    result.consensusAdd = [trimmed];
    result.sinoReply = "好的，已经记录为共识。";
  } else {
    result.pendingAdd = [trimmed];
    result.sinoReply = "已记录，我会持续跟踪这个问题，你可以继续补充或告诉我你的判断。";
  }

  // 只要在"探索"阶段产生了实质性内容（共识/待确认/已否决/关键约束），
  // 就升级为"功能论证"；纯粹的建议（suggestion）不算实质性推进。
  const hasSubstance = result.consensusAdd || result.pendingAdd || result.rejectedAdd || result.constraintAdd;
  if (stage === SINO_STAGES.EXPLORATION && hasSubstance) {
    result.stage = SINO_STAGES.ARGUMENTATION;
  }

  return result;
}

/**
 * 根据当前阶段和已积累的状态数量，判断右侧该出现哪些"下一步操作"按钮。
 * 讨论刚开始、还没有任何实质内容时不应该出现任何推进按钮。
 */
export function getSinoNextActions({
  stage,
  consensusCount = 0,
  pendingCount = 0,
  rejectedCount = 0,
  constraintCount = 0,
  hasRetrospective = false,
}) {
  switch (stage) {
    case SINO_STAGES.EXPLORATION:
    case SINO_STAGES.ARGUMENTATION: {
      const substantive = consensusCount + pendingCount + rejectedCount + constraintCount;
      if (substantive < SUBSTANTIVE_THRESHOLD) return [];
      return [
        { key: "invite-models", label: "邀请其他模型" },
        { key: "form-decision", label: "形成待决策" },
      ];
    }
    case SINO_STAGES.MULTI_MODEL:
      return [{ key: "form-decision", label: "形成待决策" }];
    case SINO_STAGES.RETROSPECTIVE:
      return hasRetrospective
        ? [{ key: "save-knowledge", label: "沉淀为知识" }]
        : [{ key: "start-retrospective", label: "开始复盘" }];
    case SINO_STAGES.IDLE:
    case SINO_STAGES.DECISION:
    case SINO_STAGES.APPROVED:
    case SINO_STAGES.EXECUTION:
    case SINO_STAGES.REVIEW:
    case SINO_STAGES.KNOWLEDGE:
    default:
      return [];
  }
}

/** 生成一次模拟的多模型讨论（观点 A/B/C + Sino 综合结论）。 */
export function buildSinoMultiModelDiscussion({ topic }) {
  const t = topic || "当前问题";
  const opinions = [
    { model: "Claude", stance: "系统架构", text: `从系统架构角度看，「${t}」建议先明确边界与约束，再决定具体实现路径。` },
    { model: "GPT", stance: "产品体验", text: `从产品体验角度看，「${t}」建议先明确边界与约束，再决定具体实现路径。` },
    { model: "DeepSeek", stance: "成本与风险", text: `从成本与风险角度看，「${t}」建议先明确边界与约束，再决定具体实现路径。` },
  ];
  const synthesis = `三方分歧主要集中在优先级排序上，但都认同「${t}」值得继续推进。建议采纳已形成的共识作为基线，冲突点留到验证阶段再判断。`;
  return { question: t, opinions, synthesis };
}
