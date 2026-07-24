import { createLocalRepository } from "./mockUtils.js";

const TYPE_LABEL = {
  deliverable: "成果审核",
  spend: "支出审批",
  policy_action: "策略动作",
  agent_publish: "Agent 发布",
  // ---- V4 新增：内容 / 直播 / 售后审批类型 ----
  content_approval: "内容审批",
  copyright_approval: "版权审批",
  compliance_approval: "平台合规审批",
  trend_approval: "热点跟进审批",
  live_plan_approval: "直播计划审批",
  live_script_approval: "直播脚本审批",
  live_risk_approval: "直播风险动作审批",
  ad_candidate_approval: "广告素材候选审批",
  after_sales_refund_approval: "售后退款审批",
  after_sales_dispute_approval: "售后纠纷审批",
  high_risk_communication_approval: "高风险沟通审批",
  knowledge_publish_approval: "知识库发布审批",
};

export function getApprovalTypeLabel(type) {
  return TYPE_LABEL[type] ?? type;
}

function seedRequests() {
  const now = Date.now();
  return [
    {
      id: "appr-1",
      type: "spend",
      requestedBy: "自动化策略：客户退款",
      summary: "退款 ¥45（超出 ¥20 自动阈值）",
      riskLevel: "medium",
      status: "pending",
      createdAt: new Date(now - 2 * 3600000).toISOString(),
      payload: { amount: 45, reason: "客户反馈商品破损" },
      sourceModule: "自动化策略中心", store: "抖音店A", platform: "抖音", object: "客户退款", amountOrCost: "¥45",
      deadline: new Date(now + 6 * 3600000).toISOString(), aiRecommendation: "建议批准（证据充分）",
      evidence: "3张实拍图", relatedRules: "客户退款自动化策略",
    },
    {
      id: "appr-2",
      type: "spend",
      requestedBy: "自动化策略：广告预算",
      summary: "广告预算调整 +¥420（超出 ¥300 自动阈值）",
      riskLevel: "low",
      status: "pending",
      createdAt: new Date(now - 5 * 3600000).toISOString(),
      payload: { amount: 420, campaign: "夏季新品推广" },
      sourceModule: "自动化策略中心", store: "抖音店A", platform: "抖音", object: "广告预算调整", amountOrCost: "¥420",
      deadline: new Date(now + 10 * 3600000).toISOString(), aiRecommendation: "建议批准（ROAS 表现良好）",
      evidence: "投放数据报表", relatedRules: "广告预算调整自动化策略",
    },
    {
      id: "appr-3",
      type: "agent_publish",
      requestedBy: "AI CEO Agent 工作室",
      summary: "发布 AI CEO Prompt 新版本 v2",
      riskLevel: "low",
      status: "approved",
      createdAt: new Date(now - 26 * 3600000).toISOString(),
      payload: { agent: "AI CEO", version: 2 },
      sourceModule: "Agent 工作室", store: "全部店铺", platform: "—", object: "AI CEO Prompt v2", amountOrCost: "—",
      deadline: null, aiRecommendation: "建议批准", evidence: "—", relatedRules: "—",
    },
    // ---- V4 新增：内容 / 直播 / 售后审批示例 ----
    {
      id: "appr-4",
      type: "content_approval",
      requestedBy: "内容中心：待审批内容",
      summary: "「为什么这件防晒衣突然被疯狂搜索？」待审批发布",
      riskLevel: "low",
      status: "pending",
      createdAt: new Date(now - 1 * 3600000).toISOString(),
      payload: {},
      sourceModule: "内容中心", store: "抖音店A", platform: "抖音", object: "口播视频内容", amountOrCost: "Token 1,800",
      deadline: new Date(now + 8 * 3600000).toISOString(), aiRecommendation: "建议批准（原创度 95，合规待复检）",
      evidence: "原创度检查报告", relatedRules: "抖音平台发布规则",
    },
    {
      id: "appr-5",
      type: "trend_approval",
      requestedBy: "热点雷达：建议跟进",
      summary: "「持续高温天气」建议 48 小时内跟进",
      riskLevel: "low",
      status: "pending",
      createdAt: new Date(now - 3 * 3600000).toISOString(),
      payload: {},
      sourceModule: "内容中心 · 热点雷达", store: "抖音店A", platform: "抖音", object: "持续高温天气", amountOrCost: "预计 Token 2,000",
      deadline: new Date(now + 48 * 3600000).toISOString(), aiRecommendation: "机会分 86，建议立即跟进",
      evidence: "热点评分报告", relatedRules: "热点匹配规则",
    },
    {
      id: "appr-6",
      type: "live_plan_approval",
      requestedBy: "AI直播中心：直播计划",
      summary: "「秋冬家纺提前购」直播计划待审批",
      riskLevel: "low",
      status: "pending",
      createdAt: new Date(now - 4 * 3600000).toISOString(),
      payload: {},
      sourceModule: "AI直播中心", store: "淘宝店A", platform: "淘宝", object: "直播计划", amountOrCost: "预算 ¥300",
      deadline: new Date(now + 24 * 3600000).toISOString(), aiRecommendation: "建议批准", evidence: "排品与脚本已生成", relatedRules: "—",
    },
    {
      id: "appr-7",
      type: "after_sales_refund_approval",
      requestedBy: "客服中心：少件工单",
      summary: "TB202407230098 少件工单待审批",
      riskLevel: "medium",
      status: "pending",
      createdAt: new Date(now - 9 * 3600000).toISOString(),
      payload: {},
      sourceModule: "客服中心", store: "淘宝店A", platform: "淘宝", object: "少件补发", amountOrCost: "¥279",
      deadline: new Date(now + 10 * 3600000).toISOString(), aiRecommendation: "建议补发（物流责任为主）",
      evidence: "开箱视频 + 发货重量记录", relatedRules: "运输破损理赔规则",
    },
    {
      id: "appr-8",
      type: "after_sales_dispute_approval",
      requestedBy: "客服中心：平台介入案例",
      summary: "XHS202407210055 健康安全投诉需双重审核",
      riskLevel: "high",
      status: "pending",
      createdAt: new Date(now - 30 * 3600000).toISOString(),
      payload: {},
      sourceModule: "客服中心", store: "小红书店A", platform: "小红书", object: "平台投诉", amountOrCost: "¥219",
      deadline: new Date(now + 4 * 3600000).toISOString(), aiRecommendation: "建议升级平台介入，需双重审核",
      evidence: "过敏照片 + 医院单据 + 成分检测报告", relatedRules: "食品药品安全投诉处理规则",
    },
  ];
}

const repository = createLocalRepository("approvalCenter.requests", seedRequests);

export function getApprovalRequests() {
  return repository.get();
}

export function decideRequest(requestId, decision) {
  return repository.update((requests) =>
    requests.map((r) => (r.id === requestId ? { ...r, status: decision } : r))
  );
}
