import { createLocalRepository, nextMockId, simulateLatency } from "./mockUtils.js";

/**
 * Prompt / Skill 资产库 = 企业级可复用资产（阶段：Founder UX
 * Review V1 修订 P0-4，V3 修订并入 Agent 工作室）。这里的
 * prompts/skills 是"资产本身"，linkedAgentIds 只是种子数据里的
 * 默认建议链接，用于 Agent 第一次创建配置时挑一个合理的默认值
 * ——不是运行时权威数据。哪些店铺的哪个 Agent 当前真正在用某个
 * Prompt/Skill，权威来源是各 Agent 自己配置里的 promptId /
 * skillBindings（agentStudioMock.js），由调用方（Agent 工作室里
 * 的「Prompt 资产库」「Skill 资产库」标签页，见
 * modules/agentStudio/AgentDetailView.jsx）实时汇总展示，本文件
 * 不倒过来依赖 agentStudioMock，避免循环依赖。不再有独立的
 * Prompt / Skill 工作室模块，避免同一份编辑界面出现在两个地方。
 */

function seedPrompts() {
  return [
    {
      id: nextMockId("prompt"),
      name: "经营分析标准 Prompt",
      category: "经营分析",
      version: 3,
      status: "published",
      linkedAgentIds: ["AI CEO"],
      content: "你是一名电商经营助理，负责根据店铺数据给出可执行的经营建议。始终用简体中文回复，先给结论，再给理由。",
      history: [
        { version: 1, note: "初始版本" },
        { version: 2, note: "增加风险提示要求" },
        { version: 3, note: "调整输出结构为结论优先" },
      ],
      metrics: { successRate: 96, avgCostUsd: 0.018, avgTokens: 1240, avgLatencyMs: 2100, evaluationScore: 91 },
    },
    {
      id: nextMockId("prompt"),
      name: "商品详情文案 Prompt",
      category: "内容生成",
      version: 1,
      status: "published",
      linkedAgentIds: ["产品 Agent"],
      content: "你是一名电商文案专家，请根据商品信息生成有吸引力的详情页文案，突出卖点与使用场景。",
      history: [{ version: 1, note: "初始版本" }],
      metrics: { successRate: 98, avgCostUsd: 0.009, avgTokens: 620, avgLatencyMs: 1400, evaluationScore: 88 },
    },
    {
      id: nextMockId("prompt"),
      name: "销售策略 Prompt",
      category: "销售策略",
      version: 1,
      status: "published",
      linkedAgentIds: ["销售 Agent"],
      content: "你是一名电商销售策略顾问，请结合店铺经营数据给出可执行的销售策略与今日行动建议。",
      history: [{ version: 1, note: "初始版本" }],
      metrics: { successRate: 93, avgCostUsd: 0.014, avgTokens: 980, avgLatencyMs: 1850, evaluationScore: 85 },
    },
    {
      id: nextMockId("prompt"),
      name: "通用运营 Prompt",
      category: "通用",
      version: 1,
      status: "draft",
      linkedAgentIds: [],
      content: "你是一名电商运营助理，请根据任务要求给出简洁、可执行的回复，先结论后理由。",
      history: [{ version: 1, note: "初始版本，作为未单独配置 Prompt 的 Agent 的默认值" }],
      metrics: { successRate: 90, avgCostUsd: 0.011, avgTokens: 700, avgLatencyMs: 1600, evaluationScore: 80 },
    },
    {
      id: nextMockId("prompt"),
      name: "热点评分 Prompt",
      category: "热点分析",
      version: 1,
      status: "published",
      linkedAgentIds: ["热点评分Agent", "热点分析Agent"],
      content: "你是一名电商热点分析师，请结合热度、增长速度、店铺/品类/商品/受众相关性等正面因子，与竞争度、版权、平台、合规、成本等负面因子，给出机会分与简要理由，先给分数再给理由。",
      history: [{ version: 1, note: "初始版本" }],
      metrics: { successRate: 91, avgCostUsd: 0.013, avgTokens: 860, avgLatencyMs: 1750, evaluationScore: 86 },
    },
    {
      id: nextMockId("prompt"),
      name: "二创脚本生成 Prompt",
      category: "内容生成",
      version: 1,
      status: "published",
      linkedAgentIds: ["脚本Agent", "二创策划Agent"],
      content: "你是一名电商内容脚本创作者，请基于给定选题、商品信息与品牌语气，生成符合平台规范的原创脚本，避免直接复制参考内容，前3秒需要有强钩子。",
      history: [{ version: 1, note: "初始版本" }],
      metrics: { successRate: 94, avgCostUsd: 0.012, avgTokens: 940, avgLatencyMs: 1900, evaluationScore: 89 },
    },
    {
      id: nextMockId("prompt"),
      name: "直播脚本生成 Prompt",
      category: "直播",
      version: 1,
      status: "published",
      linkedAgentIds: ["直播脚本Agent", "直播策划Agent"],
      content: "你是一名电商直播脚本编写者，请按开场/预热/留人/商品介绍/卖点讲解/演示/异议处理/互动/催单/行动号召/过渡/收尾的结构生成脚本，避免绝对化承诺与违规话术。",
      history: [{ version: 1, note: "初始版本" }],
      metrics: { successRate: 90, avgCostUsd: 0.014, avgTokens: 1100, avgLatencyMs: 2100, evaluationScore: 84 },
    },
    {
      id: nextMockId("prompt"),
      name: "售后沟通话术 Prompt",
      category: "售后",
      version: 1,
      status: "published",
      linkedAgentIds: ["沟通Agent"],
      content: "你是一名电商售后客服，请先致歉再说明处理方案，语气礼貌明确，金额表述精确，遵守平台响应时限，不使用模糊承诺。",
      history: [{ version: 1, note: "初始版本" }],
      metrics: { successRate: 96, avgCostUsd: 0.008, avgTokens: 520, avgLatencyMs: 1200, evaluationScore: 90 },
    },
  ];
}

function seedSkills() {
  return [
    {
      id: nextMockId("skill"),
      name: "经营摘要生成",
      description: "汇总店铺当日经营数据，输出结构化摘要，用于经营分析与晨报。",
      linkedAgentIds: ["AI CEO"],
      version: 2,
      status: "published",
      inputSchema: "{ shop_id: string, date_range: \"today\" | \"7d\" | \"30d\" }",
      outputSchema: "{ summary: string, findings: string[], risks: string[], actions: string[] }",
      exampleInput: '{ "shop_id": "demo-shop-1", "date_range": "today" }',
      exampleOutput:
        '{ "summary": "今日经营整体平稳", "findings": ["新客占比上升"], "risks": ["库存周转变慢"], "actions": ["补货 SKU-HUM-002"] }',
    },
    {
      id: nextMockId("skill"),
      name: "商品详情文案生成",
      description: "根据商品标题/类目生成营销文案，供商品中心「生成 AI 内容」调用。",
      linkedAgentIds: ["产品 Agent"],
      version: 1,
      status: "published",
      inputSchema: "{ product_title: string, category: string }",
      outputSchema: "{ title: string, description: string }",
      exampleInput: '{ "product_title": "无线降噪耳机 Pro", "category": "3C数码" }',
      exampleOutput: '{ "title": "无线降噪耳机 Pro｜沉浸静音体验", "description": "主动降噪，续航持久，办公通勤必备。" }',
    },
    {
      id: nextMockId("skill"),
      name: "销售机会挖掘",
      description: "根据近期订单与流量数据，识别值得优先跟进的销售机会。",
      linkedAgentIds: ["销售 Agent"],
      version: 1,
      status: "published",
      inputSchema: "{ shop_id: string, lookback_days: number }",
      outputSchema: "{ opportunities: { title: string, reason: string }[] }",
      exampleInput: '{ "shop_id": "demo-shop-1", "lookback_days": 7 }',
      exampleOutput: '{ "opportunities": [{ "title": "夏季防晒衣复购召回", "reason": "7 天内加购未下单用户较多" }] }',
    },
    {
      id: nextMockId("skill"),
      name: "定价建议",
      description: "结合成本、竞品与库存周转，给出定价调整建议。",
      linkedAgentIds: [],
      version: 1,
      status: "draft",
      inputSchema: "{ product_id: string }",
      outputSchema: "{ suggested_price: number, reason: string }",
      exampleInput: '{ "product_id": "SKU-SUN-001" }',
      exampleOutput: '{ "suggested_price": 119, "reason": "库存周转偏慢，建议小幅降价促销" }',
    },
    {
      id: nextMockId("skill"),
      name: "热点机会评分",
      description: "根据热度/增长/相关性等正负因子，计算热点的机会分并给出排序建议。",
      linkedAgentIds: ["热点评分Agent", "店铺机会匹配Agent"],
      version: 1,
      status: "published",
      inputSchema: "{ trend_id: string, store_id: string }",
      outputSchema: "{ opportunity_score: number, positive_factors: object[], negative_factors: object[] }",
      exampleInput: '{ "trend_id": "trend-demo-1", "store_id": "store-1" }',
      exampleOutput: '{ "opportunity_score": 86, "positive_factors": [{"factor":"热度","value":88}], "negative_factors": [{"factor":"竞争程度","value":55}] }',
    },
    {
      id: nextMockId("skill"),
      name: "二创脚本生成",
      description: "基于选题与商品信息生成短视频/图文脚本，用于内容中心二创工作台。",
      linkedAgentIds: ["脚本Agent", "二创策划Agent"],
      version: 1,
      status: "published",
      inputSchema: "{ topic: string, product_title: string, format: string }",
      outputSchema: "{ script: string, hook: string }",
      exampleInput: '{ "topic": "35度通勤实测", "product_title": "轻薄防晒衣", "format": "商品短视频" }',
      exampleOutput: '{ "script": "家人们，今天35度实测这件防晒衣...", "hook": "35度通勤到底闷不闷？" }',
    },
    {
      id: nextMockId("skill"),
      name: "直播排品建议",
      description: "根据商品角色、库存、预期转化生成直播排品顺序与理由。",
      linkedAgentIds: ["排品Agent", "直播策划Agent"],
      version: 1,
      status: "published",
      inputSchema: "{ live_plan_id: string }",
      outputSchema: "{ lineup: object[], reason: string }",
      exampleInput: '{ "live_plan_id": "live-demo-1" }',
      exampleOutput: '{ "lineup": [{"product":"轻薄防晒衣","role":"爆款","sequence":1}], "reason": "爆款商品优先承接开场流量" }',
    },
    {
      id: nextMockId("skill"),
      name: "售后责任判定",
      description: "结合证据与规则判定商家/买家/物流/供应商/平台责任。",
      linkedAgentIds: ["责任判定Agent", "规则匹配Agent"],
      version: 1,
      status: "published",
      inputSchema: "{ case_id: string }",
      outputSchema: "{ responsibility: string, reason: string }",
      exampleInput: '{ "case_id": "as-demo-1" }',
      exampleOutput: '{ "responsibility": "物流责任", "reason": "开箱视频显示外包装破损，重量记录异常" }',
    },
  ];
}

const repository = createLocalRepository("promptSkillStudio.state", () => ({
  prompts: seedPrompts(),
  skills: seedSkills(),
}));

export function getPromptSkillState() {
  return repository.get();
}

export function getPrompt(promptId) {
  return repository.get().prompts.find((p) => p.id === promptId) ?? null;
}

export function getSkill(skillId) {
  return repository.get().skills.find((s) => s.id === skillId) ?? null;
}

export function updatePromptContent(promptId, content) {
  return repository.update((state) => ({
    ...state,
    prompts: state.prompts.map((p) =>
      p.id === promptId
        ? { ...p, content, version: p.version + 1, history: [...p.history, { version: p.version + 1, note: "手动编辑" }] }
        : p
    ),
  }));
}

export async function testSkill(skillId, input) {
  await simulateLatency(400, 900);
  const skill = getSkill(skillId);
  return {
    skillId,
    input,
    output: skill
      ? `（演示）根据输入生成的模拟输出，结构参照该 Skill 的输出示例：\n${skill.exampleOutput}`
      : `（演示）根据输入 ${input || "（空）"} 生成的模拟输出结果`,
  };
}
