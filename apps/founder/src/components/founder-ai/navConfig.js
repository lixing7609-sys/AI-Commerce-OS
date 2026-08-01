// 固定工作入口 —— 与"对话记录"是两个不同的列表（对话记录在侧栏上方，
// 见 FounderAISidebar.jsx）。不再包含"功能论证""模型会议"等创建入口——
// 用户只管自然说话，Sino 自动判断当前阶段（见 sinoAnalysisService.js）。
export const NAV_ITEMS = [
  { key: "pending-decisions", label: "待决策", icon: "pending" },
  { key: "execution-tracking", label: "执行中", icon: "execution" },
  { key: "tech-radar", label: "实时情报", icon: "radar" },
  { key: "knowledge-base", label: "知识", icon: "knowledge" },
  { key: "file-center", label: "文件", icon: "files" },
  { key: "retrospective", label: "复盘", icon: "retrospective" },
  { key: "timeline", label: "时间线", icon: "history" },
  { key: "favorites", label: "收藏", icon: "star" },
  { key: "connector-status", label: "连接状态", icon: "settings" },
];

export const VIEW_LABELS = NAV_ITEMS.reduce((acc, item) => ({ ...acc, [item.key]: item.label }), {});

export const VIEW_META = {
  "pending-decisions": { title: "待决策", subtitle: "所有需要 Founder 处理的事项。" },
  "execution-tracking": { title: "执行中", subtitle: "已批准事项的执行阶段、进度与阻塞项。" },
  "tech-radar": { title: "实时情报", subtitle: "持续扫描值得关注的新技术，并判断与 AI Commerce OS 的关系。" },
  "knowledge-base": { title: "知识", subtitle: "Sino 当前可以引用的知识与长期确定的决策原则。" },
  "file-center": { title: "文件", subtitle: "PRD、原型、执行结果、测试报告等文件的统一入口。" },
  retrospective: { title: "复盘", subtitle: "验收通过后的结构化经验总结。" },
  timeline: { title: "时间线", subtitle: "按类型追溯过往的讨论、决策、执行与知识沉淀。" },
  favorites: { title: "收藏", subtitle: "集中查看收藏的情报、对话、文件与决策。" },
  "connector-status": { title: "连接状态", subtitle: "检查 GPT Brain 与 Claude Code Executor 是否就绪、当前是 Real 还是 Mock。" },
};
