/**
 * 系统 Agent 模板目录（阶段 Founder UX Review V4）。这些不是可以
 * 随意新建的"任意 Agent"——和真实后端返回的核心 Agent（AI CEO /
 * 产品 Agent / 销售 Agent 等）一样，都是系统标准模板，Founder 只能
 * 在店铺级别配置它们的 Prompt / Skill / Knowledge / Tools / Model，
 * 不能创建新的模板种类（P0-8/P0-13/P0-26/P0-33 的架构要求）。
 *
 * Agent 工作室的列表把"真实后端返回的核心 Agent"与"这里定义的
 * 模板"合并展示，共用同一套 store 级配置架构
 * （console/mock/agentStudioMock.js 的 defaultConfigFor 对任意
 * agentName 都通用，不需要为每个模板单独写死配置）。
 */

export const AGENT_CATEGORIES = [
  { key: "core", label: "核心 Agent", chainStage: "经营决策" },
  { key: "trend", label: "热点 / 趋势 Agent", chainStage: "机会发现" },
  { key: "content", label: "内容 Agent", chainStage: "内容运营" },
  { key: "traffic", label: "流量网络 Agent", chainStage: "流量分发" },
  { key: "live", label: "直播 Agent", chainStage: "直播运营" },
  { key: "dailyService", label: "日常客服 Agent", chainStage: "客服运营" },
  { key: "afterSales", label: "售后客服 Agent", chainStage: "客服运营" },
];

export const AGENT_TEMPLATES = [
  // 趋势 Agent
  { key: "热点采集Agent", category: "trend", description: "采集演示热点信号，归一化来源记录，去重并聚类相似信号，记录来源与时间戳。" },
  { key: "热点分析Agent", category: "trend", description: "解释热点为什么在上升，分类热点类型，估计生命周期，识别敏感话题，总结受众情绪。" },
  { key: "店铺机会匹配Agent", category: "trend", description: "把热点匹配到店铺、类目、商品、受众与渠道，并解释匹配理由。" },
  { key: "热点评分Agent", category: "trend", description: "计算/模拟机会分，解释正负因子，对机会排序并推荐跟进优先级。" },
  // 内容 Agent
  { key: "内容策略Agent", category: "content", description: "制定内容整体策略方向，衔接选题池与内容项目。" },
  { key: "选题Agent", category: "content", description: "从热点与内部信号中提炼具体选题角度。" },
  { key: "热点解构Agent", category: "content", description: "拆解热点的结构化要素，供二创策划参考。" },
  { key: "品牌适配Agent", category: "content", description: "确保生成内容符合店铺品牌语气与调性。" },
  { key: "二创策划Agent", category: "content", description: "规划轻量适配/深度二创/热点借势原创的具体执行方案。" },
  { key: "素材检索Agent", category: "content", description: "检索店铺自有素材库中可复用的图片、视频与文案素材。" },
  { key: "脚本Agent", category: "content", description: "生成内容脚本文案。" },
  { key: "图文Agent", category: "content", description: "生成图文类内容（笔记、详情页补充等）。" },
  { key: "图片Agent", category: "content", description: "生成/处理图片素材，包括封面与配图。" },
  { key: "视频生产Agent", category: "content", description: "生成/剪辑视频类内容。" },
  { key: "多模态生产Agent", category: "content", description: "协调图文/图片/视频/音频等多模态素材的联合生产。" },
  { key: "原创度检查Agent", category: "content", description: "检查脚本/结构/画面/音频相似度，给出原创度评分。" },
  { key: "版权检查Agent", category: "content", description: "检查素材来源授权、音乐、肖像、声音、商标、影视素材与买家内容授权。" },
  { key: "平台合规Agent", category: "content", description: "检查禁用词、营销宣称、价格宣称、医疗功效宣称、AI/数字人披露、敏感事件与未成年人相关风险。" },
  { key: "渠道适配Agent", category: "content", description: "把母版内容改编为各渠道专属版本。" },
  { key: "内容发布Agent", category: "content", description: "模拟内容发布流程，更新发布状态。" },
  { key: "内容数据Agent", category: "content", description: "汇总内容表现数据，计算内容 ROI。" },
  { key: "内容复盘Agent", category: "content", description: "复盘内容表现，产出优化建议并反馈进知识库。" },
  // 流量网络 Agent（阶段 Founder UX Review V4.1）
  { key: "流量规划Agent", category: "traffic", description: "制定流量网络的整体分发策略，衔接内容供给与账号矩阵。" },
  { key: "流量分发Agent", category: "traffic", description: "把内容资产一对多分发到官方账号/矩阵账号/运营者账号/直播/广告。" },
  { key: "流量推荐Agent", category: "traffic", description: "向运营者推荐可复用的流量资产（内容/切片/短剧/广告/教育视频/季节性活动）。" },
  { key: "流量增长Agent", category: "traffic", description: "监控账号增长趋势，识别高增长/需关注账号，提出增长建议。" },
  { key: "矩阵账号Agent", category: "traffic", description: "管理矩阵账号（行业/类目/运营者/短剧/AI教育/直播账号）的内容与表现。" },
  { key: "流量ROI Agent", category: "traffic", description: "计算流量来源/去向/转化率与 ROI，识别高价值流量路径。" },
  { key: "达人合作Agent", category: "traffic", description: "管理达人/KOC合作邀约、简报生成与分成规则同步。" },
  // 直播 Agent
  { key: "直播策划Agent", category: "live", description: "制定直播计划的主题、目标与整体节奏。" },
  { key: "排品Agent", category: "live", description: "生成直播商品排品顺序与角色分配，并解释推荐理由。" },
  { key: "直播脚本Agent", category: "live", description: "生成结构化直播脚本各环节内容。" },
  { key: "数字人或主播Agent", category: "live", description: "配置数字人形象/语音，或辅助真人主播的话术提示。" },
  { key: "AI场控Agent", category: "live", description: "实时监控直播间数据，给出场控建议（不执行真实操作）。" },
  { key: "评论互动Agent", category: "live", description: "分析直播间评论，提炼高频问题与互动建议。" },
  { key: "直播风控Agent", category: "live", description: "识别直播中的风险表述与敏感话题，标记需要人工确认的内容。" },
  { key: "直播复盘Agent", category: "live", description: "复盘直播数据，产出高表现片段与下一场建议。" },
  // 日常客服 Agent（阶段 Founder V4 架构冻结，客服中心修正）
  { key: "咨询受理Agent", category: "dailyService", description: "接收日常咨询消息，识别咨询类型，判断是否需要转交其他专项 Agent。" },
  { key: "商品问答Agent", category: "dailyService", description: "回答商品咨询、尺码咨询、材质咨询、库存咨询、使用/安装指导等问题。" },
  { key: "订单查询Agent", category: "dailyService", description: "查询订单状态，处理订单修改、发货提醒等请求。" },
  { key: "物流查询Agent", category: "dailyService", description: "查询物流状态，处理物流提醒与延迟发货沟通。" },
  { key: "销售转化Agent", category: "dailyService", description: "结合咨询上下文给出选购推荐、商品对比、复购推荐，促进咨询转化。" },
  { key: "客户情绪Agent", category: "dailyService", description: "识别客户情绪与语气变化，标记负面情绪会话供优先处理。" },
  { key: "客服风控Agent", category: "dailyService", description: "识别日常客服会话中的风险表述、投诉升级信号与超时风险。" },
  { key: "会话总结Agent", category: "dailyService", description: "对已完成会话生成摘要，沉淀高频问题与知识库更新建议。" },
  // 售后客服 Agent
  { key: "售后受理Agent", category: "afterSales", description: "读取售后事件，分类案例，提取证据，判断紧急程度。" },
  { key: "规则匹配Agent", category: "afterSales", description: "识别适用规则，比较版本，解释优先级，识别处理时限。" },
  { key: "责任判定Agent", category: "afterSales", description: "判定商家/买家/物流/供应商/平台责任，或标记证据不足。" },
  { key: "方案决策Agent", category: "afterSales", description: "决策退款/退货/换货/补发/部分退款/优惠券补偿/驳回/升级平台/转人工。" },
  { key: "沟通Agent", category: "afterSales", description: "生成符合平台语气与时限要求的买家沟通话术、证据请求与平台申诉文本。" },
  { key: "执行Agent", category: "afterSales", description: "模拟审批、驳回、退款、补发、退货地址创建与证据提交，更新案例状态。" },
  { key: "售后风控Agent", category: "afterSales", description: "检测金额异常、重复退款模式、可疑买家、高风险商品、案例聚集与时限/平台处罚风险。" },
  { key: "售后复盘Agent", category: "afterSales", description: "分析商品退款率根因、供应商/物流/内容/直播话术问题，产出知识库更新建议。" },
];

export function getAgentTemplatesByCategory(category) {
  return AGENT_TEMPLATES.filter((t) => t.category === category);
}

export function getAgentCategoryOf(agentName) {
  return AGENT_TEMPLATES.find((t) => t.key === agentName)?.category ?? "core";
}
