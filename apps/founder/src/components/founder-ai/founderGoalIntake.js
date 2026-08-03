const GOAL_ACTION = /(建设|开发|实现|修复|接入|完成|优化|升级|新增|改造|重构)/i;
const GOAL_TARGET = /(AI Commerce OS|Founder|Developer OS|产品|系统|页面|功能|工作台|控制台)/i;
const DISCUSSION_INTENT = /^(?:请|帮我|我想)?(?:分析(?:一下)?|讨论(?:一下)?|为什么|怎么看|是否应该|怎么|如何|是否|建议|研究|了解|聊聊|谈谈)/i;

export function isExplicitDeveloperGoal(text) {
  const value = text.trim();
  const detected = Boolean(value && GOAL_ACTION.test(value) && GOAL_TARGET.test(value) && !DISCUSSION_INTENT.test(value));
  return detected;
}

export async function requestDeveloperMissionIfGoal(text, developerOS) {
  if (!developerOS || !isExplicitDeveloperGoal(text)) return null;
  return developerOS.request_today_mission(text);
}
