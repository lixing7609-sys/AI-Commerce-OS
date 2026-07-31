import { randomUUID } from "node:crypto";
import { buildSeedState } from "@sinofut/domain";

// Pure business-loop logic, extracted from server.js so it can be unit-tested
// without spinning up an HTTP server. See docs/2608-v2/06-founder-daily-operations.md §16.

export function createStore() {
  let state = buildSeedState();

  function reset() {
    state = buildSeedState();
    return state;
  }

  function createOpportunity(body) {
    const opportunity = {
      id: `opp-${randomUUID().slice(0, 8)}`,
      status: "discovered",
      createdAt: new Date().toISOString(),
      ...body,
    };
    state.opportunities.push(opportunity);
    return opportunity;
  }

  function generateStrategy(opportunityId) {
    const opportunity = state.opportunities.find((o) => o.id === opportunityId);
    if (!opportunity) throw new Error("opportunity not found");

    const strategy = {
      id: `str-${randomUUID().slice(0, 8)}`,
      opportunityId: opportunity.id,
      hypothesis: `围绕「${opportunity.title}」，用短视频+图文矩阵验证选品与内容形式`,
      successMetric: "7 日内产生正向内部结算利润",
      status: "executing",
      createdAt: new Date().toISOString(),
    };
    const task = {
      id: `task-${randomUUID().slice(0, 8)}`,
      source: "workflow",
      title: `为机会「${opportunity.title}」生成内容生产任务`,
      status: "queued",
      linkedStrategyId: strategy.id,
      createdAt: new Date().toISOString(),
    };
    opportunity.status = "strategized";
    state.strategies.push(strategy);
    state.tasks.push(task);
    return { strategy, task };
  }

  function createContent(strategyId) {
    const strategy = state.strategies.find((s) => s.id === strategyId);
    if (!strategy) throw new Error("strategy not found");
    const content = {
      id: `content-${randomUUID().slice(0, 8)}`,
      strategyId,
      title: "短视频草稿：机会简报 → 选题 → 脚本 → 分镜",
      stage: "brief",
      format: "short-video",
      createdAt: new Date().toISOString(),
      productionCost: 180,
    };
    state.content.push(content);
    return content;
  }

  function advanceContent(contentId, stage) {
    const content = state.content.find((c) => c.id === contentId);
    if (!content) throw new Error("content not found");
    content.stage = stage;
    return content;
  }

  function submitForApproval(contentId) {
    const content = state.content.find((c) => c.id === contentId);
    if (!content) throw new Error("content not found");
    content.stage = "approval";
    const approval = {
      id: `appr-${randomUUID().slice(0, 8)}`,
      contentId,
      status: "pending",
      riskLevel: "normal",
      aiSuggestion: "建议通过：内容与机会/策略一致，无风险信号",
      createdAt: new Date().toISOString(),
    };
    state.approvals.push(approval);
    return approval;
  }

  function decideApproval(approvalId, decision) {
    const approval = state.approvals.find((a) => a.id === approvalId);
    if (!approval) throw new Error("approval not found");
    approval.status = decision;
    approval.decidedAt = new Date().toISOString();
    const content = state.content.find((c) => c.id === approval.contentId);
    if (content) content.stage = decision === "approved" ? "ready" : "brief";
    return approval;
  }

  function publish(contentId, channel) {
    const content = state.content.find((c) => c.id === contentId);
    if (!content) throw new Error("content not found");
    if (content.stage !== "ready") throw new Error("content not approved yet");
    const publishRecord = {
      id: `pub-${randomUUID().slice(0, 8)}`,
      contentId,
      channel: channel || "抖音（模拟渠道）",
      status: "live",
      impressions: 0,
      clicks: 0,
      leads: 0,
      adSpend: 0,
      publishedAt: new Date().toISOString(),
    };
    content.stage = "published";
    state.publishes.push(publishRecord);
    return publishRecord;
  }

  function recordMetrics(publishId, metrics) {
    const pub = state.publishes.find((p) => p.id === publishId);
    if (!pub) throw new Error("publish not found");
    pub.impressions += metrics.impressions || 0;
    pub.clicks += metrics.clicks || 0;
    pub.leads += metrics.leads || 0;
    pub.adSpend += metrics.adSpend || 0;

    let order = null;
    if (metrics.orderValue) {
      const content = state.content.find((c) => c.id === pub.contentId);
      const strategy = state.strategies.find((s) => s.id === content?.strategyId);
      order = {
        id: `order-${randomUUID().slice(0, 8)}`,
        publishId,
        opportunityId: strategy?.opportunityId,
        revenue: metrics.orderValue,
        status: "unsettled",
        createdAt: new Date().toISOString(),
      };
      state.orders.push(order);
    }
    return { publish: pub, order };
  }

  function settleOrder(orderId) {
    const order = state.orders.find((o) => o.id === orderId);
    if (!order) throw new Error("order not found");
    const pub = state.publishes.find((p) => p.id === order.publishId);
    const content = state.content.find((c) => c.id === pub?.contentId);
    const contentCost = content?.productionCost || 0;
    const adCost = pub?.adSpend || 0;
    const aiQuotaCost = 12;
    const totalCost = contentCost + adCost + aiQuotaCost;
    const netProfit = order.revenue - totalCost;

    order.status = "settled";
    order.settledAt = new Date().toISOString();

    const profit = {
      id: `profit-${randomUUID().slice(0, 8)}`,
      orderId: order.id,
      opportunityId: order.opportunityId,
      revenue: order.revenue,
      contentCost,
      adCost,
      aiQuotaCost,
      netProfit,
      createdAt: new Date().toISOString(),
    };
    state.profits.push(profit);

    const opportunity = state.opportunities.find((o) => o.id === order.opportunityId);
    if (opportunity) opportunity.status = netProfit > 0 ? "validated" : "retired";

    const capability = state.capabilities.find((c) => c.id === "cap-002");
    if (capability) {
      capability.consecutiveDays += 1;
      capability.internalSettlementValue += Math.max(netProfit, 0);
      if (capability.consecutiveDays >= 7 && capability.status !== "validated") {
        capability.status = "validated";
      }
      capability.latestSuggestion =
        netProfit > 0
          ? "本轮验证通过，建议提升该 Workflow 的内容产能配额"
          : "本轮利润为负，建议复核广告成本或内容形式再迭代一轮";
    }

    return { profit, opportunity, capability };
  }

  function tickCloudUsage(amount) {
    state.cloud.aiQuota.used = Math.min(
      state.cloud.aiQuota.total,
      state.cloud.aiQuota.used + (amount || 500)
    );
    return state.cloud;
  }

  return {
    getState: () => state,
    reset,
    createOpportunity,
    generateStrategy,
    createContent,
    advanceContent,
    submitForApproval,
    decideApproval,
    publish,
    recordMetrics,
    settleOrder,
    tickCloudUsage,
  };
}
