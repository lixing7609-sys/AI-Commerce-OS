import { STAGES } from "./conversationStore.js";

// Sino 对话实时整理 —— 当前用前端 mock 关键词规则实现，返回结构与真实模型
// 判断接口保持一致，未来可直接替换为真实调用，不需要改动调用方。
//
// analyzeUserMessage(conversation, text) 返回：
// { topic?, stage?, consensusAdd?, pendingAdd?, rejectedAdd?, constraintAdd?,
//   sinoReply, suggestion? }

function isFirstUserMessage(conversation) {
  return conversation.messages.filter((m) => m.type === "user").length === 0;
}

export function analyzeUserMessage(conversation, text) {
  const trimmed = text.trim();

  if (isFirstUserMessage(conversation)) {
    return {
      topic: trimmed.length > 22 ? `${trimmed.slice(0, 22)}…` : trimmed,
      stage: STAGES.ARGUMENT,
      sinoReply:
        "我判断这更适合作为一次功能论证来讨论。我会持续在右侧跟踪已经形成的共识、还需要确认的问题、被否决的方向和关键约束。",
    };
  }

  if (/保留.{0,4}顶部.{0,4}导航/.test(trimmed) && /左侧/.test(trimmed) && /右侧/.test(trimmed) && /Sino/i.test(trimmed)) {
    return {
      consensusAdd: ["保留现有顶部导航", "左侧采用 GPT 式对话记录", "右侧命名为 Sino"],
      sinoReply: "已记录，这几点已经形成共识，可以在右侧「已形成共识」里查看。",
    };
  }

  if (/(运行引擎|引擎状态|底层.{0,4}引擎)/.test(trimmed) && /不要显示|不显示|去掉/.test(trimmed)) {
    return {
      constraintAdd: ["主界面不得展示底层运行引擎"],
      sinoReply: "明白，我把这一点记为关键约束，后续任何页面改动都不能违反。",
    };
  }

  if (/完全同意|非常同意|全部同意/.test(trimmed)) {
    return {
      sinoReply: "当前核心结论已经较完整，建议形成待决策。",
      suggestion: { text: "当前核心结论已经较完整，建议形成待决策。", kind: "form-decision" },
    };
  }

  if (/其他模型|多个模型|模型.{0,4}讨论|换个模型/.test(trimmed)) {
    return {
      sinoReply: "好的，我来邀请其他模型一起看看这个问题。",
      suggestion: { text: "当前问题仍存在关键分歧，建议邀请其他模型参与。", kind: "multi-model" },
    };
  }

  if (/不同意|不行|否决|不采用|算了/.test(trimmed)) {
    return {
      rejectedAdd: [trimmed],
      sinoReply: "好的，这个方向先否决，已经记录下来。",
    };
  }

  if (/不要|不能|禁止|不允许|必须/.test(trimmed)) {
    return {
      constraintAdd: [trimmed],
      sinoReply: "明白，我把这一点记为关键约束。",
    };
  }

  if (/同意|没问题|可以|认可|没意见/.test(trimmed)) {
    return {
      consensusAdd: [trimmed],
      sinoReply: "好的，已经记录为共识。",
    };
  }

  return {
    pendingAdd: [trimmed],
    sinoReply: "已记录，我会持续跟踪这个问题，你可以继续补充或告诉我你的判断。",
  };
}

export function getNextActions(conversation) {
  switch (conversation.stage) {
    case STAGES.EXPLORE:
    case STAGES.ARGUMENT:
      return [
        { key: "invite-models", label: "邀请其他模型" },
        { key: "form-decision", label: "形成待决策" },
      ];
    case STAGES.MULTI_MODEL:
      return [{ key: "form-decision", label: "形成待决策" }];
    case STAGES.PENDING_DECISION:
      return [];
    case STAGES.APPROVED:
      return [];
    case STAGES.EXECUTING:
      return [];
    case STAGES.AWAITING_REVIEW:
      // 验收操作（通过/继续修改/驳回）直接在执行结果卡片上，这里不重复。
      return [];
    case STAGES.RETROSPECTIVE:
      return conversation.messages.some((m) => m.type === "retrospective")
        ? [{ key: "save-knowledge", label: "沉淀为知识" }]
        : [{ key: "start-retrospective", label: "开始复盘" }];
    case STAGES.ARCHIVED:
      return [];
    default:
      return [];
  }
}

function buildMockOpinion(model, stance, conversation) {
  const topic = conversation.topic || "当前问题";
  return { model, stance, text: `从${stance}角度看，「${topic}」建议先明确边界与约束，再决定具体实现路径。` };
}

export function buildMultiModelDiscussion(conversation) {
  const opinions = [
    buildMockOpinion("Claude", "系统架构", conversation),
    buildMockOpinion("GPT", "产品体验", conversation),
    buildMockOpinion("DeepSeek", "成本与风险", conversation),
  ];
  const synthesis = `三方分歧主要集中在优先级排序上，但都认同「${conversation.topic || "当前方向"}」值得继续推进。建议采纳已形成的共识作为基线，冲突点留到验证阶段再判断。`;
  return { question: conversation.topic || conversation.title, opinions, synthesis };
}
