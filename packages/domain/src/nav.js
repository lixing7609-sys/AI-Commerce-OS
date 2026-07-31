// Primary navigation — docs/2608-v2/03-information-architecture.md §1,
// reordered per V2-002 §4: SinoFUT / 经营驾驶舱 / Studio / Growth / 经营中心 /
// 能力中心 / Marketplace / Operator Cloud / 数据中心 / 系统管理.
// Single source of truth — no app should hardcode its own nav list.
// `internal: true` items are routes inside the Founder app; the rest are
// cross-app links to independently deployed apps (see 07-foundation-review.md §4.4).

export const PRIMARY_NAV = [
  { key: "sinofut", label: "SinoFUT", tagline: "系统唯一秘书，对话驱动一切", app: "founder", href: "/", internal: true },
  { key: "cockpit", label: "经营驾驶舱", tagline: "今天的机会/生产/经营/流量/利润/能力升级", app: "founder", href: "/cockpit", internal: true },
  { key: "studio", label: "Studio（内容生产网络）", tagline: "内容生产网络：图文/短视频/AI短剧/数字人/无限画布", app: "studio", href: "http://localhost:5182", internal: false },
  { key: "growth", label: "Growth（增长网络）", tagline: "发现机会、建设流量资产", app: "founder", href: "/growth", internal: true },
  { key: "operator", label: "经营中心", tagline: "店铺/商品/客户/广告/订单/利润的真实经营", app: "operator", href: "http://localhost:5181", internal: false },
  { key: "capability", label: "能力中心", tagline: "Agent/Prompt/Skill/Workflow/Knowledge/Connector/Capability 研发与版本管理", app: "founder", href: "/capability", internal: true },
  { key: "marketplace", label: "Marketplace", tagline: "已验证能力/内容/服务的交易市场", app: "founder", href: "/marketplace", internal: true },
  { key: "operator-cloud", label: "Operator Cloud", tagline: "设备/版本/许可证/AI经营额度/远程运维管控层", app: "operator-cloud", href: "http://localhost:5183", internal: false },
  { key: "data", label: "数据中心", tagline: "跨主体的经营数据与分析", app: "founder", href: "/data", internal: true },
  { key: "admin", label: "系统管理", tagline: "账户、权限、Connector 鉴权、系统配置", app: "founder", href: "/admin", internal: true },
];

export const COCKPIT_QUESTIONS = [
  { key: "opportunity", question: "今天有什么机会？", object: "Opportunity" },
  { key: "production", question: "今天生产什么？", object: "Content / Strategy" },
  { key: "operation", question: "今天经营什么？", object: "Product / Store / Order / Task" },
  { key: "traffic", question: "今天流量从哪里来？", object: "Campaign / Ad / Customer" },
  { key: "profit", question: "今天利润是多少？", object: "Profit" },
  { key: "capability", question: "哪些能力需要升级？", object: "Capability / Version" },
];

// Studio 左侧导航 — V2-002 §5.1。无限画布只是其中一个工作区，不是 Studio 全部。
export const STUDIO_NAV = [
  { key: "workbench", label: "工作台", path: "/" },
  { key: "library", label: "内容资产库", path: "/library" },
  { key: "articles", label: "图文/公众号文章", path: "/articles" },
  { key: "short-video", label: "短视频", path: "/short-video" },
  { key: "drama", label: "AI短剧", path: "/drama" },
  { key: "live", label: "直播素材", path: "/live" },
  { key: "avatar", label: "数字人", path: "/avatar" },
  { key: "canvas", label: "无限画布", path: "/canvas" },
  { key: "production", label: "内容生产中心", path: "/production" },
  { key: "review", label: "内容审核", path: "/review" },
  { key: "publish", label: "内容发布", path: "/publish" },
  { key: "team", label: "团队协作", path: "/team" },
  { key: "settings", label: "设置", path: "/settings" },
];

// 图文入口的细分渠道 — V2-002 §5.2。全部落地为无限画布上的内容节点，不是独立编辑器。
export const ARTICLE_CHANNELS = ["公众号文章", "小红书", "知乎", "微博", "SEO文章", "详情页", "广告文案"];

// 统一内容生命周期 — V2-002 §5.4。现有 content.stage 精细流水线映射到这七个对外状态。
export const CONTENT_LIFECYCLE_STAGES = ["draft", "producing", "reviewing", "reviewed", "publishing", "published", "archived"];

export const CONTENT_LIFECYCLE_LABEL = {
  draft: "草稿",
  producing: "生产中",
  reviewing: "待审核",
  reviewed: "已审核",
  publishing: "待发布",
  published: "已发布",
  archived: "归档",
};

const STAGE_TO_LIFECYCLE = {
  brief: "draft",
  topic: "producing",
  script: "producing",
  storyboard: "producing",
  asset: "producing",
  approval: "reviewing",
  ready: "reviewed",
  published: "published",
  archived: "archived",
};

export function contentLifecycle(stage) {
  return STAGE_TO_LIFECYCLE[stage] || "draft";
}

export function contentLifecycleLabel(stage) {
  return CONTENT_LIFECYCLE_LABEL[contentLifecycle(stage)];
}

// SinoFUT 按权限进入不同实例 — V2-002 §6。四个 App 天然是四个独立部署/来源，
// 这里只声明每个人格在全屏工作界面里显示哪些"最近"分区与快捷入口，不重复实现四套 UI。
export const SINO_PERSONAS = {
  founder: {
    id: "founder",
    label: "Founder AI",
    greeting: "早上好，Founder。今天的经营、生产、增长与能力升级都在这里。",
    sections: ["tasks", "approvals", "operations", "capabilities", "files"],
    quickActions: [
      { key: "upload", label: "上传文件" },
      { key: "continue-task", label: "继续最近任务" },
      { key: "pending-approval", label: "待审批" },
      { key: "today-operation", label: "今日经营" },
      { key: "recent-content", label: "最近生成内容" },
      { key: "recent-strategy", label: "最近增长策略" },
      { key: "recent-capability", label: "最近AI任务" },
      { key: "recent-workflow", label: "最近Workflow" },
    ],
  },
  operator: {
    id: "operator",
    label: "Operator AI",
    greeting: "早上好。店铺、订单、客服、广告、利润——今天的经营重点都在这里。",
    sections: ["tasks", "approvals", "operations", "files"],
    quickActions: [
      { key: "upload", label: "上传文件" },
      { key: "continue-task", label: "继续最近任务" },
      { key: "pending-approval", label: "待审批" },
      { key: "today-operation", label: "今日经营（订单/利润）" },
    ],
  },
  studio: {
    id: "studio",
    label: "Studio AI",
    greeting: "早上好。今天的内容生产、脚本、分镜、发布准备都在这里。",
    sections: ["tasks", "recent-content", "files"],
    quickActions: [
      { key: "upload", label: "上传文件" },
      { key: "continue-task", label: "继续最近任务" },
      { key: "recent-content", label: "最近生成内容" },
    ],
  },
  cloud: {
    id: "cloud",
    label: "Cloud AI",
    greeting: "早上好。设备、许可证、AI经营额度与远程运维状态都在这里。",
    sections: ["cloud", "files"],
    quickActions: [
      { key: "device-status", label: "设备状态" },
      { key: "quota-status", label: "AI 经营额度" },
      { key: "upload", label: "上传文件" },
    ],
  },
};
