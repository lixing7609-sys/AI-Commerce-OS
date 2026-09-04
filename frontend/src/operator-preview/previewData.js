/**
 * 经营者版 V2 原型集中演示数据（阶段：产品原型）。
 *
 * 所有演示经营数字统一放在本文件，不散落进各个组件——原型页面
 * 只负责渲染，不负责编造数据。每条数据都带 is_demo: true，页面
 * 渲染时统一显示"原型数据"标记（见 helpers/formatters.js 的
 * DEMO_DATA_LABEL），不会让经营者误以为是真实经营数据。
 *
 * 本文件不发起任何网络请求、不读取真实数据库；"真实系统数据"
 * 模式下页面改为调用 helpers/realDataApi.js 里的只读安全接口。
 */

export const DEMO_DATA_LABEL = "原型数据";

export const demoShops = [
  {
    id: "demo-shop-1",
    platform: "douyin",
    platformLabel: "抖音小店",
    name: "星辰家居抖音旗舰店",
    legalEntity: "星辰家居贸易有限公司",
    authStatus: "已授权",
    health: "normal", // normal | attention | error | not_connected | expiring
    healthLabel: "正常",
    todaySales: 8360,
    todayOrders: 112,
    changeVsYesterday: 0.086,
    currentIssue: "无",
    aiSuggestion: "转化稳定，可尝试追加投放。",
    is_demo: true,
  },
  {
    id: "demo-shop-2",
    platform: "taobao",
    platformLabel: "淘宝店铺",
    name: "星辰家居淘宝店",
    legalEntity: "星辰家居贸易有限公司",
    authStatus: "已授权",
    health: "attention",
    healthLabel: "需要关注",
    todaySales: 3120,
    todayOrders: 54,
    changeVsYesterday: -0.183,
    currentIssue: "近 3 日转化率下降",
    aiSuggestion: "建议检查主图与价格是否与竞品拉开差距。",
    is_demo: true,
  },
  {
    id: "demo-shop-3",
    platform: "amazon",
    platformLabel: "亚马逊",
    name: "Chenxing Home US",
    legalEntity: "星辰家居贸易有限公司",
    authStatus: "授权即将到期",
    health: "expiring",
    healthLabel: "授权即将到期",
    todaySales: 1200,
    todayOrders: 20,
    changeVsYesterday: 0.02,
    currentIssue: "授权将于 6 天后过期",
    aiSuggestion: "请尽快重新授权，避免同步中断。",
    is_demo: true,
  },
];

export const demoTodayMetricsPrimary = [
  { key: "sales", label: "今日销售额", value: "¥12,680", is_demo: true },
  { key: "orders", label: "今日订单", value: "186单", is_demo: true },
  { key: "customers", label: "支付客户", value: "162人", is_demo: true },
  { key: "aov", label: "客单价", value: "¥68.17", is_demo: true },
  { key: "grossProfit", label: "毛利预估", value: "¥2,460", is_demo: true },
  { key: "refunds", label: "退款金额", value: "¥328", is_demo: true },
];

export const demoTodayMetricsSecondary = [
  { key: "toShip", label: "待发货", value: "23", is_demo: true },
  { key: "afterSales", label: "售后待处理", value: "4", is_demo: true },
  { key: "lowStock", label: "库存预警", value: "6", is_demo: true },
  { key: "toListing", label: "待上架商品", value: "2", is_demo: true },
  { key: "pendingDeliverables", label: "待审核成果", value: "3", is_demo: true },
  { key: "anomalies", label: "AI发现异常", value: "1", is_demo: true },
];

export const demoSalesTrend = [
  { date: "07-15", sales: 9200, orders: 140 },
  { date: "07-16", sales: 10650, orders: 158 },
  { date: "07-17", sales: 8890, orders: 131 },
  { date: "07-18", sales: 13420, orders: 201 },
  { date: "07-19", sales: 11200, orders: 172 },
  { date: "07-20", sales: 9980, orders: 149 },
  { date: "07-21", sales: 12680, orders: 186 },
].map((point) => ({ ...point, is_demo: true }));

export const demoAdvice = [
  {
    id: "advice-1",
    title: "LED灯带适合进入30单小样本测试。",
    source: "产品AI",
    shopId: "demo-shop-1",
    reasons: [
      "当前报价有吸引力",
      "但完整成本尚未确认",
      "需要补充包装、运费、税费和售后责任",
    ],
    actions: ["查看详情", "批准测试", "要求补充", "暂不处理"],
    is_demo: true,
  },
  {
    id: "advice-2",
    title: "店铺B近3日转化下降，建议检查主图和价格。",
    source: "销售AI",
    shopId: "demo-shop-2",
    reasons: [
      "近 3 日转化率持续下降约 18%",
      "同类目竞品近期普遍降价",
      "当前主图未突出核心卖点",
    ],
    actions: ["查看详情", "批准调整", "要求补充", "暂不处理"],
    is_demo: true,
  },
  {
    id: "advice-3",
    title: "亚马逊店铺授权将于 6 天后过期，建议提前处理。",
    source: "行政AI",
    shopId: "demo-shop-3",
    reasons: [
      "授权到期后同步会中断",
      "重新授权流程约需 10 分钟",
      "建议在到期前 3 天完成",
    ],
    actions: ["查看详情", "去授权", "暂不处理"],
    is_demo: true,
  },
  {
    id: "advice-4",
    title: "本周财务数据尚未接入，建议优先完成店铺授权。",
    source: "财务AI",
    shopId: null,
    reasons: [
      "尚未接入任何真实订单/结算数据",
      "无法生成真实毛利与成本分析",
      "完成授权后财务AI可自动生成周报",
    ],
    actions: ["查看详情", "去添加店铺", "暂不处理"],
    is_demo: true,
  },
];

export const demoPendingItems = [
  {
    id: "pending-1",
    type: "待批准成果",
    title: "LED灯带小样本测试方案",
    shopId: "demo-shop-1",
    proposedBy: "产品AI",
    reason: "涉及新商品测试预算，需要经营者确认后才能推进。",
    dueLabel: "建议今日内处理",
    actions: ["批准", "驳回", "要求补充"],
    is_demo: true,
  },
  {
    id: "pending-2",
    type: "待补充信息",
    title: "LED灯带供应链数据缺口",
    shopId: "demo-shop-1",
    proposedBy: "产品AI",
    reason: "需要提供供应商报价、包装与运费信息才能完成评估。",
    dueLabel: "不阻塞其它工作",
    actions: ["去补充", "暂不处理"],
    is_demo: true,
  },
  {
    id: "pending-3",
    type: "店铺授权异常",
    title: "亚马逊店铺授权即将到期",
    shopId: "demo-shop-3",
    proposedBy: "行政AI",
    reason: "6 天后授权过期，过期后店铺数据将无法同步。",
    dueLabel: "6 天后过期",
    actions: ["去授权", "暂不处理"],
    is_demo: true,
  },
  {
    id: "pending-4",
    type: "高风险操作确认",
    title: "淘宝店铺主图批量替换方案",
    shopId: "demo-shop-2",
    proposedBy: "销售AI",
    reason: "涉及批量修改已上架商品主图，可能短期影响转化，需人工确认。",
    dueLabel: "建议 3 日内处理",
    actions: ["批准", "驳回", "要求补充"],
    is_demo: true,
  },
];

export const demoTimeline = [
  { time: "09:10", text: "AI CEO 完成今日经营分析", kind: "completed" },
  { time: "09:16", text: "产品AI完成LED灯带商品评估", kind: "completed" },
  { time: "09:22", text: "销售AI提交小样本销售方案", kind: "completed" },
  { time: "09:30", text: "等待经营者批准LED灯带小样本测试方案", kind: "waiting" },
].map((item) => ({ ...item, is_demo: true }));

// AI 秘书处工作记录：覆盖 等待我处理/进行中/已完成/异常 四个状态。
export const demoSecretaryWork = [
  {
    id: "work-1",
    status: "waiting",
    title: "LED灯带小样本测试方案",
    shopId: "demo-shop-1",
    agent: "产品AI",
    summary: "建议以 30 单进行小样本测试，需经营者批准预算。",
    devTaskId: "TASK-92913195A52A",
    is_demo: true,
  },
  {
    id: "work-2",
    status: "waiting",
    title: "淘宝店铺主图批量替换方案",
    shopId: "demo-shop-2",
    agent: "销售AI",
    summary: "涉及批量修改已上架商品主图，需经营者确认。",
    devTaskId: "TASK-33A222498155",
    is_demo: true,
  },
  {
    id: "work-3",
    status: "in_progress",
    title: "产品AI正在分析LED灯带的供应链数据缺口",
    shopId: "demo-shop-1",
    agent: "产品AI",
    progressSteps: ["已读取现有资料", "正在生成评估", "等待完成"],
    currentStep: 1,
    devTaskId: "TASK-A37F5D73BFD9",
    is_demo: true,
  },
  {
    id: "work-4",
    status: "in_progress",
    title: "销售AI正在制定小样本销售验证方案",
    shopId: "demo-shop-1",
    agent: "销售AI",
    progressSteps: ["已读取产品评估结果", "正在生成方案", "等待完成"],
    currentStep: 1,
    devTaskId: "TASK-0C46D9BDB7D8",
    is_demo: true,
  },
  {
    id: "work-5",
    status: "completed",
    title: "本周系统经营分析",
    shopId: null,
    agent: "AI CEO",
    conclusion: "整体经营平稳，产品与销售机会已识别，建议优先推进 LED 灯带测试。",
    completedAt: "2026-07-21 09:10",
    nextStep: "查看今日建议",
    devTaskId: "TASK-165357610ADD",
    deliverableId: "deliverable-3",
    is_demo: true,
  },
  {
    id: "work-6",
    status: "completed",
    title: "LED灯带商品机会评估",
    shopId: "demo-shop-1",
    agent: "产品AI",
    conclusion: "建议以小样本测试验证市场接受度，需人工补充供应链信息。",
    completedAt: "2026-07-21 09:16",
    nextStep: "查看业务结果",
    devTaskId: "TASK-39ED2C0174E6",
    deliverableId: "deliverable-1",
    is_demo: true,
  },
  {
    id: "work-7",
    status: "completed",
    title: "店铺B近期转化分析",
    shopId: "demo-shop-2",
    agent: "销售AI",
    conclusion: "转化率下降与主图吸引力不足、价格竞争力下降有关。",
    completedAt: "2026-07-20 17:40",
    nextStep: "查看业务结果",
    devTaskId: "TASK-CE11DCDE5A85",
    deliverableId: "deliverable-2",
    is_demo: true,
  },
  {
    id: "work-8",
    status: "error",
    title: "亚马逊店铺数据同步异常",
    shopId: "demo-shop-3",
    agent: "行政AI",
    impact: "亚马逊店铺今日经营数据可能未完全更新。",
    needsHandling: true,
    suggestion: "建议尽快重新授权亚马逊店铺连接。",
    devError: "AgentExecutionError:ProviderUnavailableError",
    devTaskId: "TASK-C190BDF5C64A",
    is_demo: true,
  },
];

// AI 团队（经营者视角，不含 role code / provider / capability_ready 等字段）。
export const demoAiTeam = [
  {
    name: "AI CEO",
    responsibility: "负责公司策略、经营分析与任务协调",
    busy: false,
    todayDone: "完成今日经营分析，识别 2 个需要关注的机会",
    recentCompleted: "本周系统经营分析",
    canAccept: ["经营分析", "行动建议", "跨部门协调"],
    is_demo: true,
  },
  {
    name: "产品AI",
    responsibility: "负责产品规划、选品分析与商品优化",
    busy: true,
    todayDone: "完成 LED 灯带商品评估，正在分析供应链数据缺口",
    recentCompleted: "LED灯带商品机会评估",
    canAccept: ["选品评估", "商品组合建议", "上架准备清单"],
    is_demo: true,
  },
  {
    name: "销售AI",
    responsibility: "负责客户跟进、销售分析与成交支持",
    busy: true,
    todayDone: "提交小样本销售验证方案，正在跟进店铺B转化分析",
    recentCompleted: "店铺B近期转化分析",
    canAccept: ["销售机会分析", "销售策略", "运营建议"],
    is_demo: true,
  },
  {
    name: "财务AI",
    responsibility: "负责收入、成本、利润与财务报表分析",
    busy: false,
    todayDone: "尚未接入真实财务数据，暂无可执行分析",
    recentCompleted: "暂无",
    canAccept: ["财务分析（需先接入数据）"],
    is_demo: true,
  },
  {
    name: "行政AI",
    responsibility: "负责日程、文档、提醒与内部协调",
    busy: false,
    todayDone: "发现亚马逊店铺授权即将到期并提醒经营者",
    recentCompleted: "店铺授权到期提醒",
    canAccept: ["日程提醒", "授权状态检查"],
    is_demo: true,
  },
];

// 成果（网页阅读优先，下载收进"更多操作"）。
export const demoDeliverables = [
  {
    id: "deliverable-1",
    type: "product_analysis",
    typeLabel: "产品分析",
    title: "产品分析：LED灯带小样本测试评估",
    shopId: "demo-shop-1",
    agent: "产品AI",
    status: "pending_review",
    statusLabel: "待审核",
    version: 2,
    versions: [
      { version: 1, createdAt: "2026-07-21 09:16", note: "初始生成" },
      { version: 2, createdAt: "2026-07-21 10:02", note: "补充供应商问题清单后重新生成" },
    ],
    createdAt: "2026-07-21 09:16",
    conclusion: "建议以 30 单小样本测试验证市场接受度，需补充供应链数据。",
    content: {
      verdict: "建议测试",
      reason: "报价有吸引力，但完整成本尚未确认。",
      knownFacts: ["当前未接入真实商品与供应链数据"],
      assumptions: ["假设该商品适合家居照明类目小样本测试"],
      dataGaps: ["供应商报价、包装、运费、税费尚未确认"],
      opportunities: ["LED 灯带小样本测试机会"],
      minimumViableTest: "30 单小样本测试，测试周期 2-4 周",
      listingChecklist: ["商品主图", "详情页", "定价策略"],
      supplierQuestions: ["包装与运费如何计算？", "MOQ 是多少？"],
      nextActions: ["补充供应商报价", "确认测试渠道与预算"],
      risks: ["当前分析基于假设，不可直接作为最终决策依据"],
    },
    is_demo: true,
  },
  {
    id: "deliverable-2",
    type: "sales_analysis",
    typeLabel: "销售分析",
    title: "销售分析：小样本销售验证方案",
    shopId: "demo-shop-1",
    agent: "销售AI",
    status: "pending_review",
    statusLabel: "待审核",
    version: 1,
    createdAt: "2026-07-21 09:22",
    conclusion: "建议通过私域小范围测试验证初始转化率。",
    content: {
      knownFacts: ["尚无历史销量数据"],
      dataGaps: ["缺少客单价与复购数据"],
      opportunities: ["私域测试成本可控"],
      targetCustomers: "对家居照明有需求的年轻家庭用户",
      strategy: "以私域小范围测试验证初始转化率，再决定是否扩大投放",
      actionPlan: ["筛选 100 名私域用户", "发放测试问卷", "统计转化数据"],
      risks: ["样本量小，结论需谨慎对待"],
    },
    is_demo: true,
  },
  {
    id: "deliverable-3",
    type: "ceo_analysis",
    typeLabel: "AI CEO 经营分析",
    title: "经营分析：本周系统经营分析和行动建议",
    shopId: null,
    agent: "AI CEO",
    status: "approved",
    statusLabel: "已批准",
    version: 1,
    createdAt: "2026-07-21 09:10",
    conclusion: "整体经营平稳，建议优先推进 LED 灯带测试与店铺B转化优化。",
    content: {
      summary: "本周经营平稳，任务完成率保持稳定。",
      findings: ["任务完成率稳定", "产品与销售机会已识别"],
      risks: ["部分店铺数据尚未接入，分析存在盲区"],
      priorities: ["LED 灯带小样本测试", "店铺B转化优化"],
      todayActions: ["批准 LED 灯带测试方案", "检查店铺B主图与定价"],
      delegations: ["产品AI：完成商品评估", "销售AI：制定销售验证方案"],
      decisionsNeeded: ["是否批准 LED 灯带 30 单预算"],
    },
    is_demo: true,
  },
];

// 业务记忆：9 个分类 + 8 条示例。
export const businessMemoryCategories = [
  { key: "product", label: "商品资料" },
  { key: "supplier", label: "供应商资料" },
  { key: "brand", label: "品牌与内容规范" },
  { key: "customer", label: "客户与客服规则" },
  { key: "platform", label: "平台规则" },
  { key: "sop", label: "运营SOP" },
  { key: "decision", label: "历史决策" },
  { key: "success", label: "成功经验" },
  { key: "failure", label: "失败案例" },
];

export const demoBusinessMemory = [
  {
    id: "memory-1",
    category: "product",
    title: "LED灯带基础规格模板",
    shopScope: "星辰家居抖音旗舰店",
    status: "已批准",
    lastUpdated: "2026-07-18",
    usedBy: ["产品AI"],
    source: "人工录入",
    is_demo: true,
  },
  {
    id: "memory-2",
    category: "supplier",
    title: "华南灯具供应商联系方式",
    shopScope: "全部店铺",
    status: "待补充",
    lastUpdated: "2026-07-15",
    usedBy: ["产品AI"],
    source: "人工录入",
    is_demo: true,
  },
  {
    id: "memory-3",
    category: "brand",
    title: "品牌视觉与文案规范 v2",
    shopScope: "全部店铺",
    status: "已批准",
    lastUpdated: "2026-07-10",
    usedBy: ["销售AI", "产品AI"],
    source: "人工录入",
    is_demo: true,
  },
  {
    id: "memory-4",
    category: "customer",
    title: "售后退换货标准话术",
    shopScope: "全部店铺",
    status: "已批准",
    lastUpdated: "2026-07-08",
    usedBy: ["销售AI"],
    source: "从成果沉淀",
    is_demo: true,
  },
  {
    id: "memory-5",
    category: "platform",
    title: "抖音小店发货时效规则",
    shopScope: "星辰家居抖音旗舰店",
    status: "已批准",
    lastUpdated: "2026-07-05",
    usedBy: ["行政AI"],
    source: "人工录入",
    is_demo: true,
  },
  {
    id: "memory-6",
    category: "sop",
    title: "新品小样本测试标准流程",
    shopScope: "全部店铺",
    status: "已批准",
    lastUpdated: "2026-07-19",
    usedBy: ["产品AI", "销售AI"],
    source: "从成果沉淀",
    is_demo: true,
  },
  {
    id: "memory-7",
    category: "decision",
    title: "是否进入无线充电器品类的决策记录",
    shopScope: "全部店铺",
    status: "已批准",
    lastUpdated: "2026-07-12",
    usedBy: ["AI CEO"],
    source: "从成果沉淀",
    is_demo: true,
  },
  {
    id: "memory-8",
    category: "failure",
    title: "上一次盲目跟风爆款失败案例",
    shopScope: "淘宝店铺",
    status: "已批准",
    lastUpdated: "2026-06-30",
    usedBy: ["产品AI", "AI CEO"],
    source: "人工录入",
    is_demo: true,
  },
];

export const secretaryQuickQuestions = [
  "今天公司怎么样？",
  "哪家店铺需要关注？",
  "今天我需要批准什么？",
  "AI今天完成了什么？",
  "给我制定今天的工作重点。",
  "查看LED灯带评估结果。",
];

export const secretaryCannedReplies = {
  "今天公司怎么样？":
    "今天整体经营平稳：销售额 ¥12,680（原型数据），发现 1 个需要关注的店铺（店铺B转化下降）。AI CEO 已生成今日经营分析，建议优先处理 LED 灯带测试方案。",
  "哪家店铺需要关注？":
    "淘宝店铺近 3 日转化率下降约 18%，建议检查主图和价格；亚马逊店铺授权将于 6 天后到期，建议尽快重新授权。",
  "今天我需要批准什么？":
    "有 2 项等待你处理：LED灯带小样本测试方案（产品AI提出）、淘宝店铺主图批量替换方案（销售AI提出）。",
  "AI今天完成了什么？":
    "AI CEO 完成今日经营分析；产品AI完成LED灯带商品评估；销售AI提交了小样本销售验证方案。",
  "给我制定今天的工作重点。":
    "建议优先：1）批准或补充 LED 灯带测试方案；2）检查店铺B转化下降原因；3）关注亚马逊店铺授权到期提醒。",
  "查看LED灯带评估结果。":
    "LED灯带小样本测试评估：建议以 30 单小样本测试验证市场接受度，需补充供应商报价、包装与运费信息后再最终确认。可在「成果」页面查看完整结果。",
};

export const secretaryDefaultReply =
  "这是产品原型中的模拟回复，正式版将连接真实AI秘书工作流为你解答。";
