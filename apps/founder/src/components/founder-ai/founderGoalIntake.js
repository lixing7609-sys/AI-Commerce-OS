export const GOAL_CLASSIFICATION = Object.freeze({
  DEVELOPER_GOAL: "developer_goal",
  DISCUSSION: "discussion",
  UNCLEAR: "unclear",
});

const DEVELOPMENT_ACTIONS = [
  "改成", "修改", "新增", "删除", "开发", "实现", "优化", "重构",
  "升级", "替换", "调整", "修复", "支持", "创建", "建设", "接入", "完成", "改造",
];
const DISCUSSION_OPENERS = [
  "分析一下", "讨论一下", "为什么", "怎么看", "是否应该", "帮我比较", "给我建议",
];
const CONCRETE_TARGETS = [
  "AI Commerce OS", "Founder", "Developer OS", "Mission Planner", "Decision Center",
  "页面", "首页", "卡片", "标题", "布局", "组件", "功能", "工作台", "控制台", "Greeting",
];
const STRUCTURED_CHANGE_PATTERNS = [
  /^(?:请)?\s*(?:把|将)\s*(?<object>.+?)\s*(?:做成|改造成|接入|升级为)\s*(?<result>.+)$/u,
  /^(?:请)?\s*让\s*(?<object>.+?)\s*显示\s*(?<result>.+)$/u,
  /^(?:请)?\s*给\s*(?<object>.+?)\s*增加\s*(?<result>.+)$/u,
];

function includesAny(value, candidates) {
  const normalized = value.toLocaleLowerCase();
  return candidates.some((candidate) => normalized.includes(candidate.toLocaleLowerCase()));
}

function hasConcreteObject(value) {
  const quotedValues = [...value.matchAll(/[“‘"']([^”’"']+)[”’"']/g)];
  return quotedValues.length > 0 || includesAny(value, CONCRETE_TARGETS);
}

function hasStructuredChange(value) {
  return STRUCTURED_CHANGE_PATTERNS.some((pattern) => {
    const match = value.match(pattern);
    return Boolean(match?.groups?.object?.trim() && match?.groups?.result?.trim());
  });
}

export function classifyFounderGoal(text) {
  const value = text.trim();
  if (!value) return GOAL_CLASSIFICATION.UNCLEAR;
  const discussionValue = value.replace(/^(?:请|你)\s*/u, "");
  if (DISCUSSION_OPENERS.some((opener) => discussionValue.startsWith(opener))) {
    return GOAL_CLASSIFICATION.DISCUSSION;
  }
  if (hasStructuredChange(value)) return GOAL_CLASSIFICATION.DEVELOPER_GOAL;
  const hasAction = includesAny(value, DEVELOPMENT_ACTIONS) || /把.+(?:改成|替换为|调整为).+/u.test(value);
  if (hasAction && hasConcreteObject(value)) return GOAL_CLASSIFICATION.DEVELOPER_GOAL;
  return GOAL_CLASSIFICATION.UNCLEAR;
}

export async function requestDeveloperMissionIfGoal(text, developerOS, classification = classifyFounderGoal(text)) {
  if (!developerOS || classification !== GOAL_CLASSIFICATION.DEVELOPER_GOAL) return null;
  return developerOS.request_today_mission(text);
}

export async function routeFounderMessage(text, developerOS) {
  const classification = classifyFounderGoal(text);
  if (classification === GOAL_CLASSIFICATION.DEVELOPER_GOAL) {
    return {
      classification,
      snapshot: await requestDeveloperMissionIfGoal(text, developerOS, classification),
      clarification: null,
    };
  }
  if (classification === GOAL_CLASSIFICATION.UNCLEAR) {
    return {
      classification,
      snapshot: null,
      clarification: "请确认你希望我直接修改哪个具体页面、组件或功能，以及预期改成什么结果？",
    };
  }
  return { classification, snapshot: null, clarification: null };
}
