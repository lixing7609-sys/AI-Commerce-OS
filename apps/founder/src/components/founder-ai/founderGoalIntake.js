export const GOAL_CLASSIFICATION = Object.freeze({
  DEVELOPER_GOAL: "developer_goal",
  DISCUSSION: "discussion",
  UNCLEAR: "unclear",
});

const DISCUSSION_PATTERNS = [/^分析/u, /^讨论/u, /^为什么/u, /^怎么看/u, /^是否应该/u, /^帮我比较/u, /^给我建议/u];
const ACTION_PATTERNS = [
  { intent: "build", pattern: /(?:建立|创建|开发|搭建|新增|增加|实现|支持|做一个|我需要一个|让系统)/u },
  { intent: "modify", pattern: /(?:把|将|修改|升级|优化|重构|替换|调整|改造成|接入)/u },
  { intent: "fix", pattern: /(?:修复|解决|纠正)/u },
];
const SCOPE_PATTERN = /(?:页面|模块|Agent|Dashboard|Center|系统|能力|工作流|日报|预测|监控|预警|功能|首页|布局|组件|卡片|数据)/iu;
const GENERIC_ONLY = /^(?:一下|一点|更好|更完善|一个东西|某个东西|随便优化|帮我弄好|搞个东西|做得更好一点)$/iu;

function clean(value) {
  return value.trim().replace(/[。！？!?]+$/u, "").trim();
}

function extractStructure(value, actionMatch) {
  const action = actionMatch?.[0] || "";
  const after = clean(value.slice((actionMatch?.index || 0) + action.length));
  const structured = value.match(/^(?:请)?\s*(?:把|将)\s*(.+?)\s*(?:做成|改造成|接入|升级为|改为)\s*(.+)$/u)
    || value.match(/^(?:请)?\s*让\s*(.+?)\s*(?:显示|支持|可以)\s*(.+)$/u);
  const object = clean(structured?.[1] || after.replace(/^(?:一个|一套|系统可以|能够|可以)\s*/u, ""));
  const outcome = clean(structured?.[2] || (actionMatch?.[0] === "让系统" ? after : ""));
  const meaningful = object && !GENERIC_ONLY.test(object) && object.length >= 2;
  return { object: meaningful ? object : null, outcome: outcome || (meaningful ? object : null) };
}

export function parseFounderGoal(text) {
  const value = clean(text || "");
  if (!value) return {
    intent: "unclear", object: null, outcome: null, scope_hint: null,
    confidence: 0, requires_clarification: true, clarification_reason: "缺少业务目标",
  };
  const discussion = value.replace(/^(?:请|你)\s*/u, "");
  if (DISCUSSION_PATTERNS.some((pattern) => pattern.test(discussion))) return {
    intent: discussion.startsWith("分析") ? "analyze" : "discuss",
    object: null, outcome: null, scope_hint: null, confidence: 0.98,
    requires_clarification: false, clarification_reason: null,
  };
  const structuralMatch = value.match(/^(?:请)?\s*(?:把|将)\s*(.+?)\s*(?:做成|改造成|接入|升级为|改为)\s*(.+)$/u)
    || value.match(/^(?:请)?\s*让\s*(.+?)\s*(?:显示|支持|可以)\s*(.+)$/u);
  if (structuralMatch) {
    const { object, outcome } = extractStructure(value, { 0: "", index: 0 });
    const scopeHint = (value.match(SCOPE_PATTERN) || [null])[0];
    const confident = Boolean(object && outcome);
    return {
      intent: "modify", object, outcome, scope_hint: scopeHint,
      confidence: confident ? 0.9 : 0.35,
      requires_clarification: !confident,
      clarification_reason: confident ? null : "缺少可识别的业务对象或预期结果",
    };
  }
  const actionMatch = ACTION_PATTERNS.map(({ intent, pattern }) => ({ intent, match: pattern.exec(value) }))
    .filter(({ match }) => match)
    .sort((a, b) => a.match.index - b.match.index)[0];
  if (!actionMatch) return {
    intent: "unclear", object: null, outcome: null, scope_hint: null,
    confidence: 0.2, requires_clarification: true, clarification_reason: "未识别到明确的业务目标",
  };
  const { object, outcome } = extractStructure(value, actionMatch.match);
  const scopeHint = (value.match(SCOPE_PATTERN) || [null])[0];
  const confident = Boolean(object && (outcome || scopeHint));
  return {
    intent: actionMatch.intent,
    object,
    outcome,
    scope_hint: scopeHint,
    confidence: confident ? 0.9 : 0.35,
    requires_clarification: !confident,
    clarification_reason: confident ? null : "缺少可识别的业务对象或预期结果",
  };
}

export function classifyFounderGoal(text) {
  const parsed = parseFounderGoal(text);
  if (parsed.intent === "analyze" || parsed.intent === "discuss") return GOAL_CLASSIFICATION.DISCUSSION;
  if (["build", "modify", "fix"].includes(parsed.intent) && !parsed.requires_clarification) {
    return GOAL_CLASSIFICATION.DEVELOPER_GOAL;
  }
  return GOAL_CLASSIFICATION.UNCLEAR;
}

export async function requestDeveloperMissionIfGoal(text, developerOS, classification = classifyFounderGoal(text)) {
  if (!developerOS || classification !== GOAL_CLASSIFICATION.DEVELOPER_GOAL) return null;
  return developerOS.request_today_mission(text);
}

export async function routeFounderMessage(text, developerOS, options = {}) {
  let parsed = parseFounderGoal(text);
  if (typeof options.classifier === "function") {
    try {
      const modelResult = await options.classifier(text);
      if (modelResult?.intent) parsed = { ...parsed, ...modelResult };
    } catch {
      // Deterministic structured fallback remains authoritative when Brain is unavailable.
    }
  }
  const classification = ["build", "modify", "fix"].includes(parsed.intent) && !parsed.requires_clarification
    ? GOAL_CLASSIFICATION.DEVELOPER_GOAL
    : (parsed.intent === "analyze" || parsed.intent === "discuss" ? GOAL_CLASSIFICATION.DISCUSSION : GOAL_CLASSIFICATION.UNCLEAR);
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
