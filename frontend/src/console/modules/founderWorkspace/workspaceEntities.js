/**
 * Shared entity model for Founder Workspace (Charter §3.1) — Decision,
 * Risk, Validation Metric, Notification all share one status
 * vocabulary and a `sourceModule`/`linkedModule` pointer so every one
 * of the 8 Workspace pages drills into the module that actually
 * produced the underlying data, instead of being 7 unrelated
 * dashboards with their own bespoke status language.
 *
 * `rejected`/`executed` were added to the vocabulary (中文框架审查
 * 版) so Decisions can render the product spec's required five-state
 * view (待决策/审议中/已批准/已驳回/已执行) without inventing a
 * second, page-local status language — approve/reject/mark-executed
 * on the Decisions page transitions a decision through these same
 * states.
 */
export const STATUS_LABEL = {
  pending: "待处理",
  "in-review": "审核中",
  approved: "已批准",
  blocked: "已阻塞",
  resolved: "已解决",
  rejected: "已驳回",
  executed: "已执行",
};

export const STATUS_TONE = {
  pending: "warning",
  "in-review": "info",
  approved: "success",
  blocked: "danger",
  resolved: "neutral",
  rejected: "danger",
  executed: "neutral",
};

export const RISK_CATEGORY_LABEL = {
  business: "经营风险",
  content: "内容风险",
  system: "系统风险",
  device: "设备风险",
  cost: "成本风险",
  compliance: "合规风险",
};

export const NOTIFICATION_CATEGORY_LABEL = {
  system: "系统通知",
  approval: "审批通知",
  business: "经营通知",
  content: "内容通知",
  device: "设备通知",
  security: "安全通知",
};

export function getDecisions() {
  return [
    {
      id: "dec-taobao-price-cut",
      title: "「新城」店铺大促价格审批",
      summary: "AI 定价 Agent 建议对 12 个 SKU 降价 8%–15% 冲刺周末大促 GMV，超出自动执行阈值，需人工批准。",
      status: "pending",
      priority: "P0",
      owner: "Founder",
      impact: "影响「新城」店铺 12 个 SKU 的售价，预计涉及未来 3 天在售库存约 ¥18.6 万。",
      dueAt: "2026-07-31T10:00:00Z",
      sourceModule: "Operator Lab",
      sourceModuleLabel: "审批中心",
      linkedModule: "approvalCenter",
      createdAt: "2026-07-30T02:10:00Z",
    },
    {
      id: "dec-shortdrama-ep04-review",
      title: "《都市重生》EP04 终审",
      summary: "剧本+成片已通过 AI 内容审核，等待 Founder 终审后进入矩阵账号发布队列。",
      status: "in-review",
      priority: "P1",
      owner: "Founder",
      impact: "影响 13 个矩阵账号的本周发布排期，延迟终审将顺延后续 3 集的发布节奏。",
      dueAt: "2026-07-31T18:00:00Z",
      sourceModule: "Studio Lab",
      sourceModuleLabel: "AI 短剧 · 内容审核",
      linkedModule: "studioLab",
      linkedSubView: "contentReview",
      createdAt: "2026-07-29T18:40:00Z",
    },
    {
      id: "dec-agent-eval-promote",
      title: "客服 Agent Prompt v2.3 评测通过，申请转正式",
      summary: "A/B 评测显示 v2.3 满意度 +6.2pt、成本 -9%，胜出 v2.1，等待批准发布到全部店铺。",
      status: "pending",
      priority: "P1",
      owner: "Founder",
      impact: "发布后将替换全部 5 个店铺的客服 Agent 默认 Prompt，预计当日生效。",
      dueAt: "2026-08-01T10:00:00Z",
      sourceModule: "AI Capability Center",
      sourceModuleLabel: "Capability Center · 评估中心",
      linkedModule: "capabilityCenter",
      createdAt: "2026-07-29T11:05:00Z",
    },
    {
      id: "dec-token-topup",
      title: "Token 余额授予",
      summary: "3 个店铺当日 Agent 任务预计因 Token 不足中断，需要 Founder 从 Cloud Center 授予额度或充值。",
      status: "blocked",
      priority: "P0",
      owner: "Founder",
      impact: "不处理将导致 3 个店铺的补货/客服/内容 Agent 任务在今日内中断执行。",
      dueAt: "2026-07-30T12:00:00Z",
      sourceModule: "Cloud Center",
      sourceModuleLabel: "Token",
      linkedModule: "tokenCenter",
      createdAt: "2026-07-30T01:00:00Z",
    },
    {
      id: "dec-marketplace-listing",
      title: "「客服话术包 v4」上架审核",
      summary: "第三方能力包已通过安全扫描，等待 Founder 审核定价与授权范围后上架 Marketplace。",
      status: "approved",
      priority: "P2",
      owner: "Founder",
      impact: "上架后将对全部 Operator 可见，可被采购并接入客服 Agent。",
      dueAt: "2026-08-03T10:00:00Z",
      sourceModule: "Cloud Center",
      sourceModuleLabel: "Marketplace · 上架审核",
      linkedModule: "marketplaceCenter",
      createdAt: "2026-07-28T09:20:00Z",
    },
  ];
}

export function getRisks() {
  return [
    {
      id: "risk-token-balance",
      title: "Token 余额低于预警线",
      level: "high",
      category: "cost",
      concern: "剩余 1,240，低于 2,000 预警线，今日仍有 3 个 Agent 任务待执行，可能因余额不足而中断。",
      status: "pending",
      owner: "Founder",
      progress: "待处理 · 等待授予或充值",
      sourceModule: "Cloud Center",
      sourceModuleLabel: "Token",
      linkedModule: "tokenCenter",
      detectedAt: "2026-07-30T01:00:00Z",
    },
    {
      id: "risk-eval-regression",
      title: "广告策略 Agent 评测出现回归",
      level: "medium",
      category: "system",
      concern: "v3.1 相比 v3.0 在「大促预算分配」场景得分下降 4.5pt，建议暂缓发布并复查训练数据。",
      status: "in-review",
      owner: "AI Capability Center 负责人",
      progress: "复查中 · 训练数据回溯排查",
      sourceModule: "AI Capability Center",
      sourceModuleLabel: "Capability Center · 评估中心",
      linkedModule: "capabilityCenter",
      detectedAt: "2026-07-29T22:15:00Z",
    },
    {
      id: "risk-autoops-refund-spike",
      title: "客户退款自动执行接近阈值",
      level: "medium",
      category: "business",
      concern: "过去 24 小时自动退款笔数同比 +38%，虽仍在阈值内，接近触发人工复核上限。",
      status: "pending",
      owner: "Operator Lab 负责人",
      progress: "监控中 · 尚未超阈值",
      sourceModule: "Operator Lab",
      sourceModuleLabel: "Organization · 自动经营",
      linkedModule: "operatorLab",
      linkedSubView: "autoOps",
      detectedAt: "2026-07-29T20:00:00Z",
    },
    {
      id: "risk-license-expiry",
      title: "「新城」店铺 License 30 天后到期",
      level: "low",
      category: "compliance",
      concern: "当前套餐将于 2026-08-29 到期，建议提前续费避免 Agent 能力被降级。",
      status: "pending",
      owner: "Cloud Center 负责人",
      progress: "待处理 · 待续费",
      sourceModule: "Cloud Center",
      sourceModuleLabel: "License",
      linkedModule: "cloudCenter",
      linkedSubView: "licenses",
      detectedAt: "2026-07-28T08:00:00Z",
    },
    {
      id: "risk-content-review-backlog",
      title: "内容审核积压超过 SLA",
      level: "medium",
      category: "content",
      concern: "Studio Lab 待终审内容已超过 24 小时 SLA，最长一条已积压 26 小时，可能影响本周发布节奏。",
      status: "pending",
      owner: "Studio Lab 负责人",
      progress: "待处理 · 等待 Founder 终审",
      sourceModule: "Studio Lab",
      sourceModuleLabel: "内容审核",
      linkedModule: "studioLab",
      linkedSubView: "contentReview",
      detectedAt: "2026-07-29T16:00:00Z",
    },
    {
      id: "risk-device-storage",
      title: "设备存储空间告警",
      level: "low",
      category: "device",
      concern: "锚点设备 mac-mini-op-0001 磁盘剩余空间低于 15%，建议清理历史素材或扩容，否则可能影响内容生产任务。",
      status: "pending",
      owner: "Cloud Center 负责人",
      progress: "待处理 · 尚未安排清理",
      sourceModule: "Cloud Center",
      sourceModuleLabel: "设备管理",
      linkedModule: "cloudCenter",
      linkedSubView: "devices",
      detectedAt: "2026-07-29T09:30:00Z",
    },
  ];
}

export function getBusinessValidation() {
  return {
    summary: "2 个店铺已产生真实 GMV，3 个仍是纯演示数据——真实经营验证仍在早期阶段。",
    metrics: [
      { label: "真实 GMV（30 天）", value: "¥86,420", delta: 12 },
      { label: "演示 GMV（30 天）", value: "¥312,900", delta: null },
      { label: "已接入真实店铺", value: "2 / 5" },
      { label: "真实订单数", value: "341" },
    ],
    shops: [
      { id: 719, name: "新城", mode: "real", gmv: 61200, orders: 214, note: "抖音小店，2026-06 起真实经营" },
      { id: 718, name: "演示店铺", mode: "demo", gmv: 0, orders: 0, note: "长期用于功能演示，不计入真实验证" },
      { id: 731, name: "淘宝旗舰店", mode: "real", gmv: 25220, orders: 127, note: "2026-07 新接入，处于爬坡期" },
      { id: 742, name: "小红书店铺", mode: "demo", gmv: 41800, orders: 96, note: "尚未真实接入支付，数据为模拟" },
      { id: 753, name: "TikTok Shop", mode: "demo", gmv: 271100, orders: 0, note: "仅完成店铺连接，未开始真实运营" },
    ],
  };
}

export function getContentValidation() {
  return {
    summary: "本月 Studio 产出内容中，已真实发布并有互动数据的占比 41%，其余为生产队列/演示样片。",
    metrics: [
      { label: "已发布（真实）", value: "58 条", delta: 18 },
      { label: "演示/未发布", value: "83 条" },
      { label: "平均完播率", value: "34.2%" },
      { label: "归因 GMV", value: "¥18,600" },
    ],
    items: [
      { id: "cv-1", title: "《都市重生》EP01-03", type: "AI 短剧", mode: "real", engagement: "完播 41%，评论 1,204", publishedAt: "2026-07-20" },
      { id: "cv-2", title: "夏季新品图文合集", type: "AI 图文", mode: "real", engagement: "点击率 6.8%", publishedAt: "2026-07-25" },
      { id: "cv-3", title: "开箱直播 · 折叠加湿器", type: "AI 直播", mode: "demo", engagement: "演示数据，未真实开播", publishedAt: "—" },
      { id: "cv-4", title: "《都市重生》EP04", type: "AI 短剧", mode: "queue", engagement: "待终审（见 Decisions）", publishedAt: "—" },
    ],
  };
}

export function getCloudStatusSummary() {
  return {
    summary: "1 台 NAS 设备在线，AI 运营系统运行正常，License 30 天后到期需要关注。",
    metrics: [
      { label: "在线设备", value: "1 / 1" },
      { label: "License 状态", value: "30 天后到期" },
      { label: "Token 余额", value: "1,240" },
      { label: "待处理 OTA", value: "0" },
    ],
    services: [
      { name: "AI 运营系统", status: "运行中", detail: "5/5 AI 员工正常" },
      { name: "backend-api", status: "running", detail: "运行时长 3d 4h" },
      { name: "Marketplace 同步", status: "running", detail: "上次同步 12 分钟前" },
    ],
  };
}

export function getNotifications() {
  return [
    { id: "n-1", title: "Token 余额低于预警线", meta: "Cloud Center · Token · 2 小时前", status: "danger", statusLabel: "高风险", category: "system", read: false, linkedModule: "tokenCenter" },
    { id: "n-2", title: "《都市重生》EP04 等待终审", meta: "Studio Lab · 内容审核 · 4 小时前", status: "info", statusLabel: "待决策", category: "approval", read: false, linkedModule: "studioLab", linkedSubView: "contentReview" },
    { id: "n-3", title: "客服 Agent Prompt v2.3 评测通过", meta: "AI Capability Center · Capability Center · 昨天", status: "success", statusLabel: "待批准", category: "approval", read: false, linkedModule: "capabilityCenter" },
    { id: "n-4", title: "「客服话术包 v4」已上架 Marketplace", meta: "Cloud Center · Marketplace · 2 天前", status: "neutral", statusLabel: "已完成", category: "business", read: true, linkedModule: "marketplaceCenter" },
    { id: "n-5", title: "广告策略 Agent v3.1 评测出现回归", meta: "AI Capability Center · 评估中心 · 昨天", status: "warning", statusLabel: "需复查", category: "system", read: true, linkedModule: "capabilityCenter" },
    { id: "n-6", title: "内容审核积压提醒", meta: "Studio Lab · 内容审核 · 6 小时前", status: "warning", statusLabel: "需关注", category: "content", read: false, linkedModule: "studioLab", linkedSubView: "contentReview" },
    { id: "n-7", title: "设备存储空间告警", meta: "Cloud Center · 设备管理 · 8 小时前", status: "warning", statusLabel: "需关注", category: "device", read: false, linkedModule: "cloudCenter" },
    { id: "n-8", title: "检测到一次异常登录尝试", meta: "Cloud Center · 安全中心 · 1 天前", status: "danger", statusLabel: "需核实", category: "security", read: true, linkedModule: "cloudCenter" },
  ];
}
