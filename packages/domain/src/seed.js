// Demo seed data — illustrative only, not real business data.
// Single source of truth for the first real-operating-loop demo
// (docs/2608-v2/06-founder-daily-operations.md, V2-001 任务第十六条 LED 灯带示例).
// services/api seeds its in-memory store from this file; every V2 app reads the
// same live state from services/api rather than keeping its own mock copy.

export function buildSeedState() {
  const now = Date.now();
  const iso = (offsetMinutes = 0) => new Date(now + offsetMinutes * 60000).toISOString();

  return {
    opportunities: [
      {
        id: "opp-001",
        title: "LED 灯带内容增长机会（示意）",
        source: "抖音热点信号",
        estimatedScale: "中",
        confidence: 0.72,
        category: "家居 / 灯具",
        status: "validating",
        createdAt: iso(-480),
      },
      {
        id: "opp-002",
        title: "夏季户外露营装备选题（示意）",
        source: "SEO 关键词机会",
        estimatedScale: "小",
        confidence: 0.55,
        category: "户外",
        status: "discovered",
        createdAt: iso(-300),
      },
    ],
    strategies: [],
    tasks: [],
    content: [],
    approvals: [],
    publishes: [],
    orders: [],
    profits: [],
    capabilities: [
      {
        id: "cap-001",
        name: "机会评分 Agent",
        status: "validated",
        consecutiveDays: 9,
        manualOverrideRate: 0.08,
        internalSettlementValue: 1280,
      },
      {
        id: "cap-002",
        name: "短视频分镜生成 Workflow",
        status: "validating",
        consecutiveDays: 4,
        manualOverrideRate: 0.31,
        internalSettlementValue: 340,
      },
      {
        id: "cap-003",
        name: "客服升级 Agent",
        status: "building",
        consecutiveDays: 0,
        manualOverrideRate: null,
        internalSettlementValue: 0,
      },
    ],
    cloud: {
      devices: [
        { id: "dev-001", name: "Founder 主实例", status: "online", version: "2608.2.1" },
        { id: "dev-002", name: "Operator 演示店铺一体机", status: "online", version: "2608.2.0" },
      ],
      license: { type: "Founder 内部验证版", expiresAt: iso(60 * 24 * 90), status: "active" },
      aiQuota: { total: 100000, used: 34210, cycle: "2026-07", warnAt: 0.8 },
      faults: [],
    },
  };
}
