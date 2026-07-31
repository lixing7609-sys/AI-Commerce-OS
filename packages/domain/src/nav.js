// Primary navigation, verbatim from docs/2608-v2/03-information-architecture.md §1.
// Single source of truth — no app should hardcode its own nav list.

export const PRIMARY_NAV = [
  { key: "sinofut", label: "SinoFUT", tagline: "系统唯一秘书，对话驱动一切", app: "founder" },
  { key: "cockpit", label: "经营驾驶舱", tagline: "今天的机会/生产/经营/流量/利润/能力升级", app: "founder" },
  { key: "growth", label: "增长网络", tagline: "发现机会、建设流量资产", app: "founder" },
  { key: "studio", label: "内容生产网络", tagline: "无限画布生产内容资产", app: "studio" },
  { key: "operator", label: "经营中心", tagline: "店铺/商品/客户/广告/订单/利润的真实经营", app: "operator" },
  { key: "capability", label: "能力中心", tagline: "Agent/Prompt/Skill/Workflow/Knowledge/Connector/Capability 研发与版本管理", app: "founder" },
  { key: "marketplace", label: "Marketplace", tagline: "已验证能力/内容/服务的交易市场", app: "founder" },
  { key: "operator-cloud", label: "Operator Cloud", tagline: "设备/版本/许可证/AI经营额度/远程运维管控层", app: "operator-cloud" },
  { key: "data", label: "数据中心", tagline: "跨主体的经营数据与分析", app: "founder" },
  { key: "admin", label: "系统管理", tagline: "账户、权限、Connector 鉴权、系统配置", app: "founder" },
];

// Founder app hosts SinoFUT + cockpit + growth + capability + marketplace + data + admin
// (see docs/2608-v2/07-foundation-review.md §4.4). Operator / Studio / Operator Cloud are
// independently deployable apps and only show their own entry in the founder-style nav.
export const FOUNDER_APP_NAV = PRIMARY_NAV.filter((item) => item.app === "founder");

export const COCKPIT_QUESTIONS = [
  { key: "opportunity", question: "今天有什么机会？", object: "Opportunity" },
  { key: "production", question: "今天生产什么？", object: "Content / Strategy" },
  { key: "operation", question: "今天经营什么？", object: "Product / Store / Order / Task" },
  { key: "traffic", question: "今天流量从哪里来？", object: "Campaign / Ad / Customer" },
  { key: "profit", question: "今天利润是多少？", object: "Profit" },
  { key: "capability", question: "哪些能力需要升级？", object: "Capability / Version" },
];
