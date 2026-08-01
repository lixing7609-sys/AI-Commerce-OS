// 固定系统导航 —— 系统工作台页面（与"对话记录"是两个不同的列表，
// 详见 FounderAISidebar.jsx：功能论证/模型会议/决策事项/执行任务/文件分析
// 不再作为固定导航常驻，改为对话模式，只能从"新建"悬浮菜单、快捷模式卡、
// SinoFUT 自动意图建议、已创建的对话记录中进入）。
export const NAV_GROUPS = [
  {
    label: "AI 董事会",
    items: [{ key: "tech-radar", label: "技术雷达", icon: "radar" }],
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
  "decision-center": { title: "决策中心", subtitle: "AI 董事会 · 决策中心 · 公司总控" },
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

// 对话模式元数据 —— 悬浮新建菜单、快捷工作模式卡、模式徽章共用同一份定义。
export const MODE_META = {
  chat: { key: "chat", label: "普通对话", description: "从一个问题或想法开始", icon: "chat" },
  "functional-argumentation": { key: "functional-argumentation", label: "功能论证", description: "判断一个功能是否值得开发", icon: "argument" },
  "model-meeting": { key: "model-meeting", label: "模型会议", description: "让多个模型分别提出方案并汇总", icon: "meeting" },
  decision: { key: "decision", label: "决策事项", description: "建立需要正式判断和跟踪的事项", icon: "decision" },
  "execution-task": { key: "execution-task", label: "执行任务", description: "创建可执行、可跟踪的工作任务", icon: "execution" },
  "file-analysis": { key: "file-analysis", label: "文件分析", description: "上传文件并进行研究分析", icon: "files" },
};

// 悬浮"新建"菜单 —— 6 项，按钮下方的箭头弹出，不挤压侧栏。
export const NEW_MENU_ITEMS = [
  MODE_META.chat,
  MODE_META["functional-argumentation"],
  MODE_META["model-meeting"],
  MODE_META.decision,
  MODE_META["execution-task"],
  MODE_META["file-analysis"],
];

// 对话首页输入框下方的快捷工作模式卡 —— 只是快捷方式，不强制。
export const QUICK_MODE_CARDS = [
  MODE_META["functional-argumentation"],
  MODE_META["model-meeting"],
  MODE_META.decision,
  MODE_META["file-analysis"],
];
