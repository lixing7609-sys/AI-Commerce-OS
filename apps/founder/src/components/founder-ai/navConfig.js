export const DEFAULT_VIEW = "decision-center";

export const NAV_GROUPS = [
  {
    label: "AI 董事会",
    items: [
      { key: "functional-argumentation", label: "功能论证", icon: "argument" },
      { key: "model-meeting", label: "模型会议", icon: "meeting" },
      { key: "tech-radar", label: "技术雷达", icon: "radar" },
    ],
  },
  {
    label: "公司总控",
    items: [
      { key: "decision-center", label: "决策中心", icon: "decision" },
      { key: "system-overview", label: "系统总览", icon: "overview" },
      { key: "pending-decisions", label: "待决策", icon: "pending" },
      { key: "execution-tracking", label: "执行跟踪", icon: "execution" },
    ],
  },
  {
    label: "Founder Workspace",
    items: [
      { key: "knowledge-base", label: "知识库", icon: "knowledge" },
      { key: "file-center", label: "文件中心", icon: "files" },
      { key: "decision-memory", label: "决策记忆", icon: "memory" },
    ],
  },
  {
    label: "历史",
    items: [
      { key: "history", label: "历史", icon: "history" },
      { key: "favorites", label: "收藏", icon: "star" },
    ],
  },
];

export const VIEW_LABELS = NAV_GROUPS.flatMap((g) => g.items).reduce(
  (acc, item) => ({ ...acc, [item.key]: item.label }),
  {}
);

export const VIEW_META = {
  "decision-center": { title: "Founder AI", subtitle: "AI 董事会 · 决策中心 · 公司总控" },
  "functional-argumentation": { title: "功能论证", subtitle: "与 AI 一起判断一个功能是否值得做、如何验证、是否进入开发。" },
  "model-meeting": { title: "模型会议", subtitle: "由多个大模型分别提出方案，再由 SinoFUT 汇总分歧和建议。" },
  "tech-radar": { title: "技术雷达", subtitle: "持续扫描值得关注的新技术，并判断与 AI Commerce OS 的关系。" },
  "system-overview": { title: "系统总览", subtitle: "Founder / Studio / Growth / Operator / Cloud 的关键变化、异常与风险。" },
  "pending-decisions": { title: "待决策", subtitle: "所有需要 Founder 处理的事项。" },
  "execution-tracking": { title: "执行跟踪", subtitle: "已批准事项的执行阶段、进度与阻塞项。" },
  "knowledge-base": { title: "知识库", subtitle: "Founder AI 当前可以引用的知识来源。" },
  "file-center": { title: "文件中心", subtitle: "PRD、原型、执行结果、测试报告等文件的统一入口。" },
  "decision-memory": { title: "决策记忆", subtitle: "长期确定的架构、边界与原则。" },
  history: { title: "历史", subtitle: "按类型追溯过往的论证、会议、异常与决策。" },
  favorites: { title: "收藏", subtitle: "集中查看收藏的情报、论证、会议、文件与决策。" },
};

export const NEW_MENU_ITEMS = [
  { key: "functional-argumentation", label: "新建功能论证" },
  { key: "model-meeting", label: "新建模型会议" },
  { key: "pending-decisions", label: "新建决策事项" },
  { key: "execution-tracking", label: "新建执行任务" },
  { key: "decision-memory", label: "新建决策记忆" },
  { key: "file-center", label: "新建文件分析" },
];
