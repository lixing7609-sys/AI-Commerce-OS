import { createLocalRepository, nextMockId, simulateLatency, tagDemo } from "../../shared/localRepository.js";

/**
 * Studio Agent 矩阵的 Mock 数据层（阶段：Studio V3 Integration §八/
 * §十八 + 补充§五）。内容生产 Agent 矩阵（14）+ 图文生产/运营 Agent
 * 矩阵（13），合计 27 个角色化 Agent。
 *
 * 读写权限按"谁能看到什么"分两层，不是整份数据对两端一视同仁：
 *   - `getAgentStatusList()` 只返回状态展示字段（名称/职责/状态/
 *     当前任务/进度/成本/是否需人工介入）——独立 Studio 的 Studio
 *     秘书首页和 Founder Studio 实验室都可以用，属于"看得到 Agent
 *     在做什么"的正常经营可见性。
 *   - `getStudioLabState()` 返回完整数据（含 Prompt/Skill 版本、
 *     模型路由配置、回放、评测、运行日志、版本发布），以及所有
 *     write 函数（发布/回滚 Prompt、编辑模型路由等）——这些是系统级
 *     研发配置能力，只被 console/modules/studioLab/ 的 Founder 专属
 *     页面消费，standalone StudioApp.jsx 不导入这些——与
 *     engineering-standards.md §12 Rule 4"Founder专属研发页面不泄漏
 *     进Operator/Studio自己的registry"保持一致的边界思路。
 */

export const CONTENT_AGENTS = [
  { agentId: "agent-trend", name: "Trend Agent", responsibility: "全平台热点扫描与初筛" },
  { agentId: "agent-research", name: "Research Agent", responsibility: "选题背景调研与竞品分析" },
  { agentId: "agent-director", name: "Director Agent", responsibility: "内容项目整体方向与创作Brief" },
  { agentId: "agent-writer", name: "Writer Agent", responsibility: "剧本/长文生成" },
  { agentId: "agent-script", name: "Script Agent", responsibility: "单集/单条脚本生成" },
  { agentId: "agent-storyboard", name: "Storyboard Agent", responsibility: "分镜生成与镜头规划" },
  { agentId: "agent-character", name: "Character Agent", responsibility: "角色一致性与形象生成" },
  { agentId: "agent-scene", name: "Scene Agent", responsibility: "场景生成与一致性" },
  { agentId: "agent-image", name: "Image Agent", responsibility: "图片/封面生成" },
  { agentId: "agent-video", name: "Video Agent", responsibility: "视频生成与渲染" },
  { agentId: "agent-editing", name: "Editing Agent", responsibility: "AI剪辑、节奏与转场" },
  { agentId: "agent-voice", name: "Voice Agent", responsibility: "配音、字幕与BGM匹配" },
  { agentId: "agent-review", name: "Review Agent", responsibility: "内容审核与合规检查" },
  { agentId: "agent-publisher", name: "Publisher Agent", responsibility: "矩阵发布与排期" },
  { agentId: "agent-traffic", name: "Traffic Agent", responsibility: "流量池经营与优化建议" },
  { agentId: "agent-advertising", name: "Advertising Agent", responsibility: "广告资源匹配与投放建议" },
  { agentId: "agent-monetization", name: "Monetization Agent", responsibility: "商业变现路径分析" },
  { agentId: "agent-analytics", name: "Analytics Agent", responsibility: "内容数据复盘与洞察" },
];

export const GRAPHIC_AGENTS = [
  { agentId: "agent-topic-research", name: "Topic Research Agent", responsibility: "图文热点、关键词、用户问题与竞品内容研究" },
  { agentId: "agent-graphic-director", name: "Graphic Content Director Agent", responsibility: "图文项目整体方向、平台与变现目标" },
  { agentId: "agent-outline", name: "Outline Agent", responsibility: "文章结构、大纲与信息层级" },
  { agentId: "agent-article-writer", name: "Article Writer Agent", responsibility: "长文/短文/种草/知识文章生成" },
  { agentId: "agent-title", name: "Title Agent", responsibility: "标题、副标题与封面标题 A/B 版本" },
  { agentId: "agent-seo", name: "SEO Agent", responsibility: "关键词、搜索意图与正文关键词布局" },
  { agentId: "agent-graphic-planner", name: "Graphic Planner Agent", responsibility: "配图位置、图片功能与说明规划" },
  { agentId: "agent-infographic", name: "Infographic Agent", responsibility: "数据图、流程图、清单图与信息长图" },
  { agentId: "agent-layout", name: "Layout Agent", responsibility: "图文排版、卡片结构与分页适配" },
  { agentId: "agent-platform-adapt", name: "Platform Adaptation Agent", responsibility: "同一内容适配小红书/公众号/知乎/头条" },
  { agentId: "agent-graphic-review", name: "Graphic Review Agent", responsibility: "事实、逻辑、违禁词、版权与平台规则检查" },
  { agentId: "agent-graphic-publisher", name: "Graphic Publisher Agent", responsibility: "多平台图文发布、定时与标签" },
  { agentId: "agent-graphic-traffic", name: "Graphic Traffic Agent", responsibility: "搜索流量、收藏、转发与账号增长" },
];

const MODELS = ["GLM-4-Studio", "GLM-4-Vision", "Qwen2.5-Max", "DeepSeek-V3", "Video-Gen v3", "Image-Gen v2", "Voice-Clone v1"];

function seedAgents() {
  const all = [...CONTENT_AGENTS, ...GRAPHIC_AGENTS];
  return all.map((base, idx) => {
    const running = idx % 4 === 0;
    const needsAttention = idx % 9 === 3;
    return {
      ...base,
      status: needsAttention ? "needs_attention" : running ? "running" : idx % 4 === 1 ? "completed" : "idle",
      currentTask: running ? `处理 ${idx % 2 === 0 ? "proj-7 EP03" : "gproj-1"} 相关任务` : "空闲",
      progress: running ? 40 + (idx * 7) % 55 : idx % 4 === 1 ? 100 : 0,
      primaryModel: MODELS[idx % MODELS.length],
      backupModel: MODELS[(idx + 2) % MODELS.length],
      promptVersion: `v${1 + (idx % 3)}.${idx % 5}`,
      skillCombo: [`${base.name} 核心技能包`, "平台规则包 v3"],
      workflow: base.agentId.startsWith("agent-graphic") || GRAPHIC_AGENTS.some((g) => g.agentId === base.agentId) ? "AI图文生产流程" : "内容生产十阶段流程",
      toolPermissions: ["调用模型API", "读取知识库", "写入内容项目"],
      lastRunAt: new Date(Date.now() - idx * 3600_000).toISOString(),
      cost: Math.round((120 + idx * 37.5) * 100) / 100,
      successRate: Math.round((88 + (idx % 10)) * 10) / 10,
      latencyMs: 800 + (idx % 6) * 250,
      needsHumanIntervention: needsAttention,
    };
  });
}

function seedPrompts() {
  return [...CONTENT_AGENTS, ...GRAPHIC_AGENTS].flatMap((agent, idx) => ([
    { promptId: `prompt-${agent.agentId}-1`, agentId: agent.agentId, version: 1, status: "deprecated", content: `你是 ${agent.name}，负责${agent.responsibility}。（v1 初版）`, note: "初版上线", publishedAt: new Date(Date.now() - (idx + 40) * 86400000).toISOString(), publishedBy: "Founder" },
    { promptId: `prompt-${agent.agentId}-2`, agentId: agent.agentId, version: 2, status: "published", content: `你是 ${agent.name}，负责${agent.responsibility}。请严格遵循平台规则包与品牌语气要求，输出结构化结果。`, note: "补充平台规则约束", publishedAt: new Date(Date.now() - (idx + 5) * 86400000).toISOString(), publishedBy: "Founder" },
    { promptId: `prompt-${agent.agentId}-3`, agentId: agent.agentId, version: 3, status: "draft", content: `你是 ${agent.name}，负责${agent.responsibility}。在 v2 基础上增加成本控制与人工复核触发条件。`, note: "草稿：成本控制", publishedAt: "", publishedBy: "" },
  ]));
}

function seedSkills() {
  return [
    { skillId: "skill-shortdrama-pace", name: "红果24集短剧节奏模板", domainKnowledge: "红果平台爆款节奏结构", workSteps: "开篇3秒钩子→每集反转→结尾悬念", outputTemplate: "剧本大纲JSON", prohibitions: "禁止露骨/引战内容", qualityRules: "情绪曲线检查", callableTools: ["剧本生成API"], example: "《重生豪门》EP03", version: 4, applicableAgentIds: ["agent-writer", "agent-script"] },
    { skillId: "skill-storyboard-consistency", name: "分镜一致性检查Skill", domainKnowledge: "角色/场景一致性ID规则", workSteps: "生成镜头→比对一致性ID→标记风险", outputTemplate: "镜头列表JSON", prohibitions: "禁止跨集角色形象漂移", qualityRules: "一致性评分>=85", callableTools: ["一致性比对API"], example: "EP03 18镜头", version: 3, applicableAgentIds: ["agent-storyboard", "agent-character"] },
    { skillId: "skill-graphic-seo", name: "图文SEO关键词布局Skill", domainKnowledge: "各平台搜索排序机制", workSteps: "关键词研究→标题布局→正文密度控制", outputTemplate: "关键词+密度报告", prohibitions: "禁止关键词堆砌", qualityRules: "关键词密度2%-4%", callableTools: ["搜索指数API"], example: "《AI一人公司》SEO优化", version: 2, applicableAgentIds: ["agent-seo", "agent-article-writer"] },
    { skillId: "skill-platform-adapt", name: "多平台图文改写Skill", domainKnowledge: "小红书/公众号/知乎/头条风格差异", workSteps: "母稿拆解→按平台规则改写→格式校验", outputTemplate: "平台版本JSON", prohibitions: "禁止跨平台内容不一致", qualityRules: "平台风格匹配度检查", callableTools: ["平台风格库"], example: "gproj-1 四平台版本", version: 3, applicableAgentIds: ["agent-platform-adapt"] },
  ];
}

function seedModelRoutes() {
  return [...CONTENT_AGENTS, ...GRAPHIC_AGENTS].map((agent, idx) => ({
    agentId: agent.agentId, primaryModel: MODELS[idx % MODELS.length], backupModel: MODELS[(idx + 2) % MODELS.length],
    imageModel: "Image-Gen v2", videoModel: "Video-Gen v3", voiceModel: "Voice-Clone v1",
    maxTokens: 4096 + (idx % 4) * 1024, temperature: 0.4 + (idx % 5) * 0.1, timeoutSeconds: 60,
    retryCount: 2, perCallCostLimit: 5 + (idx % 3) * 2, dailyCostLimit: 200 + (idx % 5) * 50,
    autoSwitchModel: idx % 3 !== 0, fallbackStrategy: idx % 3 !== 0 ? "主模型超时或成本超限时自动切换备用模型" : "不自动切换，超限直接告警",
  }));
}

function seedReplayTasks() {
  return [
    { replayId: "replay-1", agentId: "agent-writer", taskSummary: "《重生后我接管了老板的公司》EP03 剧本生成", originalInput: "热点：红果女性重生短剧；风格：情绪爽剧", originalOutput: "EP03 剧本 v2（已采用）", createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
    { replayId: "replay-2", agentId: "agent-storyboard", taskSummary: "EP03 分镜生成（18镜头）", originalInput: "EP03 剧本 v2 + 24集短剧节奏模板", originalOutput: "18 个镜头 JSON（一致性评分均值 91）", createdAt: new Date(Date.now() - 1 * 86400000).toISOString() },
    { replayId: "replay-3", agentId: "agent-article-writer", taskSummary: "gproj-1 正文生成", originalInput: "大纲 + Brief + trend-1 热点资料", originalOutput: "正文 6 个内容块 v1", createdAt: new Date(Date.now() - 0.5 * 86400000).toISOString() },
  ];
}

function seedEvaluationRuns() {
  return [
    { evalId: "eval-1", agentId: "agent-writer", promptVersionA: 2, promptVersionB: 3, metric: "剧本采纳率", scoreA: 78, scoreB: 86, costA: 0.42, costB: 0.51, winner: "B" },
    { evalId: "eval-2", agentId: "agent-title", promptVersionA: 1, promptVersionB: 2, metric: "标题点击率(模拟)", scoreA: 61, scoreB: 74, costA: 0.05, costB: 0.06, winner: "B" },
    { evalId: "eval-3", agentId: "agent-seo", promptVersionA: 1, promptVersionB: 2, metric: "关键词覆盖率", scoreA: 70, scoreB: 68, costA: 0.08, costB: 0.09, winner: "A" },
  ];
}

function seedRunLogs() {
  return Array.from({ length: 20 }).map((_, idx) => {
    const agent = [...CONTENT_AGENTS, ...GRAPHIC_AGENTS][idx % (CONTENT_AGENTS.length + GRAPHIC_AGENTS.length)];
    return {
      logId: `log-${idx + 1}`, agentId: agent.agentId, agentName: agent.name,
      message: `${agent.name} 完成一次任务执行`, level: idx % 11 === 0 ? "warning" : "info",
      tokenCost: 200 + idx * 30, durationMs: 900 + idx * 60, at: new Date(Date.now() - idx * 1800_000).toISOString(),
    };
  });
}

function seedReleases() {
  return [
    { releaseId: "rel-1", packType: "Prompt Pack", name: "内容生产 Prompt Pack v2.3", version: "2.3.0", status: "已发布", rolloutProgress: 100 },
    { releaseId: "rel-2", packType: "Skill Pack", name: "图文生产 Skill Pack v1.4", version: "1.4.0", status: "灰度中", rolloutProgress: 40 },
    { releaseId: "rel-3", packType: "Model Routing Policy", name: "全 Agent 模型路由策略 v3", version: "3.0.0", status: "已发布", rolloutProgress: 100 },
    { releaseId: "rel-4", packType: "Platform Rule Pack", name: "平台规则包（红果/小红书/公众号）v1.1", version: "1.1.0", status: "草稿", rolloutProgress: 0 },
    { releaseId: "rel-5", packType: "Studio Workflow Pack", name: "AI图文14阶段流程 Pack v1.0", version: "1.0.0", status: "已发布", rolloutProgress: 100 },
    { releaseId: "rel-6", packType: "内容模板包", name: "多平台图文模板包 v1.2", version: "1.2.0", status: "灰度中", rolloutProgress: 60 },
  ];
}

const repository = createLocalRepository("studio.founderLab.agents", () => ({
  agents: seedAgents(),
  prompts: seedPrompts(),
  skills: seedSkills(),
  modelRoutes: seedModelRoutes(),
  replayTasks: seedReplayTasks(),
  evaluationRuns: seedEvaluationRuns(),
  runLogs: seedRunLogs(),
  releases: seedReleases(),
}));

export function getStudioLabState() {
  return tagDemo(repository.get());
}

/** 状态展示专用的轻量读取——独立 Studio 的 Studio秘书首页用这个。 */
export function getAgentStatusList() {
  const { agents } = repository.get();
  return tagDemo(
    agents.map(({ agentId, name, responsibility, status, currentTask, progress, cost, needsHumanIntervention }) => ({
      agentId, name, responsibility, status, currentTask, progress, cost, needsHumanIntervention,
    }))
  );
}

export async function saveAgentPromptDraft(agentId, content) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({
    ...state,
    prompts: [
      ...state.prompts.map((p) => (p.agentId === agentId && p.status === "draft" ? { ...p, content } : p)),
    ],
  }));
}

export async function publishPromptVersion(promptId) {
  await simulateLatency(300, 600);
  return repository.update((state) => {
    const target = state.prompts.find((p) => p.promptId === promptId);
    if (!target) return state;
    return {
      ...state,
      prompts: state.prompts.map((p) => {
        if (p.promptId === promptId) return { ...p, status: "published", publishedAt: new Date().toISOString(), publishedBy: "Founder" };
        if (p.agentId === target.agentId && p.status === "published") return { ...p, status: "deprecated" };
        return p;
      }),
    };
  });
}

export async function rollbackPromptVersion(agentId, version) {
  await simulateLatency(300, 600);
  return repository.update((state) => ({
    ...state,
    prompts: state.prompts.map((p) => {
      if (p.agentId !== agentId) return p;
      if (p.version === version) return { ...p, status: "published", publishedAt: new Date().toISOString(), publishedBy: "Founder（回滚）" };
      if (p.status === "published") return { ...p, status: "deprecated" };
      return p;
    }),
  }));
}

export async function updateModelRoute(agentId, patch) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({
    ...state,
    modelRoutes: state.modelRoutes.map((r) => (r.agentId === agentId ? { ...r, ...patch } : r)),
  }));
}

export async function runReplay(replayId, options) {
  await simulateLatency(600, 1200);
  return repository.update((state) => ({
    ...state,
    replayTasks: state.replayTasks.map((r) =>
      r.replayId === replayId
        ? { ...r, lastReplayOutput: `使用新配置（${options.newPromptVersion ?? "当前发布版本"}）重新运行完成——结果与原输出对比中`, lastReplayAt: new Date().toISOString() }
        : r
    ),
  }));
}

export async function runPromptTest(agentId, variantsCount = 2) {
  await simulateLatency(500, 900);
  return {
    testId: nextMockId("ptest"), agentId,
    results: Array.from({ length: variantsCount }).map((_, i) => ({
      variant: String.fromCharCode(65 + i), qualityScore: 70 + Math.round(Math.random() * 25),
      cost: (0.3 + Math.random() * 0.4).toFixed(2), latencyMs: 800 + Math.round(Math.random() * 600),
    })),
  };
}
