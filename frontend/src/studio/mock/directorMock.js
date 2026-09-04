import { createLocalRepository, nextMockId, simulateLatency, tagDemo } from "../../shared/localRepository.js";

/**
 * AI导演工作台的 Mock 数据层（阶段：Studio V3 Integration §十）。
 * 十阶段生产流程 + 分镜/角色/场景/资产库，全部按 projectId 归档，
 * 演示深度以 proj-1《重生后我接管了老板的公司》EP03 为准（与高保真
 * 原型的分镜示例保持一致：18 个镜头，视频生成进度 12/18），其余
 * 项目回退到一套默认骨架，保证任意 contentProjects 行点击"进入
 * 导演台"都能进入一个真实可操作的工作台，不是白屏或占位。
 */

export const DIRECTOR_STAGES = [
  { stageKey: "trend", order: 1, name: "热点分析", agentName: "Trend Agent" },
  { stageKey: "brief", order: 2, name: "创作 Brief", agentName: "Director Agent" },
  { stageKey: "script", order: 3, name: "剧本生成", agentName: "Writer Agent" },
  { stageKey: "episodeScript", order: 4, name: "单集/单条脚本", agentName: "Script Agent" },
  { stageKey: "storyboard", order: 5, name: "分镜生成", agentName: "Storyboard Agent" },
  { stageKey: "characterScene", order: 6, name: "角色与场景生成", agentName: "Character Agent" },
  { stageKey: "generation", order: 7, name: "图片/视频生成", agentName: "Video Agent" },
  { stageKey: "editing", order: 8, name: "AI剪辑", agentName: "Editing Agent" },
  { stageKey: "review", order: 9, name: "内容审核", agentName: "Review Agent" },
  { stageKey: "publish", order: 10, name: "矩阵发布与变现", agentName: "Publisher Agent" },
];

const STAGE_TARGET_PAGE = {
  script: "scriptStoryboard", episodeScript: "scriptStoryboard", storyboard: "scriptStoryboard",
  characterScene: "characterScene", generation: "mediaGeneration", editing: "aiEditing", review: "contentReview",
};

export function getStageTargetPage(stageKey) {
  return STAGE_TARGET_PAGE[stageKey] ?? null;
}

function defaultStageState(projectId) {
  return DIRECTOR_STAGES.map((s) => ({
    ...s,
    projectId,
    status: s.order === 1 ? "completed" : s.order === 2 ? "in_progress" : "pending",
    promptVersion: "v1.0", skillUsed: `${s.agentName} 默认技能包`, modelUsed: "GLM-4-Studio",
    tokenCost: 0, computeCost: 0, lastRunAt: null, runLog: [],
  }));
}

function proj1Stages() {
  const base = DIRECTOR_STAGES.map((s) => ({
    ...s, projectId: "proj-7", promptVersion: "v2.3",
    skillUsed: `${s.agentName} · 红果24集短剧节奏模板`, modelUsed: "GLM-4-Studio",
    tokenCost: 0, computeCost: 0, lastRunAt: null, runLog: [],
  }));
  const overrides = {
    trend: { status: "completed", tokenCost: 200, computeCost: 0, runLog: ["Trend Agent 已锁定红果重生题材"] },
    brief: { status: "completed", tokenCost: 400, computeCost: 0, runLog: ["生成目标受众/平台/情绪/收益模型 Brief"] },
    script: { status: "completed", tokenCost: 12000, computeCost: 0, runLog: ["生成 24 集总剧本与人物弧光 v2"] },
    episodeScript: { status: "completed", tokenCost: 3200, computeCost: 0, runLog: ["EP03 台词/动作/节奏生成完成"] },
    storyboard: { status: "in_progress", tokenCost: 5600, computeCost: 4, runLog: ["Storyboard Agent 已生成 18 个镜头，等待人工确认"] },
    characterScene: { status: "completed", tokenCost: 2800, computeCost: 12, runLog: ["人物一致性 ID 与场景资产生成完成"] },
    generation: { status: "in_progress", tokenCost: 9600, computeCost: 88, runLog: ["Video Agent 正在渲染镜头 12/18"] },
    editing: { status: "pending", tokenCost: 0, computeCost: 0, runLog: [] },
    review: { status: "pending", tokenCost: 0, computeCost: 0, runLog: [] },
    publish: { status: "pending", tokenCost: 0, computeCost: 0, runLog: ["红果主发 · 抖音预热 · 视频号分发（排期中）"] },
  };
  return base.map((s) => ({ ...s, ...overrides[s.stageKey] }));
}

const SHOT_SEED_5 = [
  { shotType: "办公室广角", shotSize: "全景", description: "林晚推门进入会议室，所有人突然安静。", durationSeconds: 3, dialogue: "", status: "generated" },
  { shotType: "女主近景", shotSize: "近景", description: "眼神冷静，手中握着公司公章。", durationSeconds: 2, dialogue: "", status: "generated" },
  { shotType: "男主反应", shotSize: "近景", description: "周启抬头，表情第一次出现慌乱。", durationSeconds: 2, dialogue: "", status: "generated" },
  { shotType: "文件特写", shotSize: "特写", description: "股权转让协议被重重放在桌上。", durationSeconds: 1.5, dialogue: "", status: "generated" },
  { shotType: "对峙双人景", shotSize: "双人中景", description: "林晚与周启对峙，全场屏息。", durationSeconds: 4, dialogue: "从今天起，这家公司由我说了算。", status: "generated" },
];

function proj1Shots() {
  const shots = SHOT_SEED_5.map((s, idx) => ({
    shotId: `shot-${idx + 1}`, projectId: "proj-7", order: idx + 1, ...s,
    characters: idx === 2 ? ["周启"] : ["林晚"], action: "缓步走位，情绪逐步升级", expression: idx === 2 ? "慌乱" : "冷静克制",
    narration: "", cameraMovement: idx === 0 ? "推镜" : idx === 4 ? "环绕" : "固定", scene: "公司会议室",
    lighting: "冷色顶光", style: "都市悬疑写实", aspectRatio: "9:16",
    generationModel: "Video Model A · 电影感", cost: 3.6, consistencyScore: 93, platformRisk: "低",
    agentSuggestion: idx === 1 ? "建议增加\"公章特写\" 0.8 秒，强化权力逆转的情绪钩子。" : "",
  }));
  for (let i = 6; i <= 18; i += 1) {
    const generated = i <= 12;
    shots.push({
      shotId: `shot-${i}`, projectId: "proj-7", order: i,
      shotType: i % 3 === 0 ? "环境空镜" : i % 2 === 0 ? "配角反应" : "双人对话",
      shotSize: i % 3 === 0 ? "远景" : "中景", description: `EP03 第 ${i} 镜头 · 情节推进补充镜头`,
      characters: i % 2 === 0 ? ["周启"] : ["林晚"], action: "对话推进剧情", expression: "紧张",
      dialogue: i % 4 === 0 ? "董事会那边，我会处理。" : "", narration: "", cameraMovement: "固定",
      scene: i % 3 === 0 ? "深夜办公室" : "公司会议室", lighting: "冷色顶光", style: "都市悬疑写实",
      aspectRatio: "9:16", generationModel: "Video Model A · 电影感", cost: 2.8 + (i % 3) * 0.4,
      consistencyScore: 88 + (i % 5), platformRisk: "低", agentSuggestion: "",
      durationSeconds: 2 + (i % 3), status: generated ? "generated" : "draft",
    });
  }
  return shots;
}

function defaultShots(projectId) {
  return Array.from({ length: 6 }).map((_, idx) => ({
    shotId: `${projectId}-shot-${idx + 1}`, projectId, order: idx + 1,
    shotType: "待生成", shotSize: "中景", description: "点击「重新生成」让分镜 Agent 生成该镜头内容。",
    characters: [], action: "", expression: "", dialogue: "", narration: "", cameraMovement: "固定",
    scene: "待定", lighting: "待定", style: "待定", aspectRatio: "9:16", generationModel: "Video Model A · 电影感",
    cost: 0, consistencyScore: 0, platformRisk: "—", agentSuggestion: "", durationSeconds: 2, status: "draft",
  }));
}

function seedAssetLibrary() {
  return {
    "proj-7": [
      { icon: "👩", label: "女主 · 林晚", detail: "28岁 / 创业者 / 冷静克制", tab: "角色" },
      { icon: "👨", label: "男主 · 周启", detail: "35岁 / 公司老板 / 强势", tab: "角色" },
      { icon: "🏢", label: "场景 · 公司会议室", detail: "", tab: "场景" },
      { icon: "🌃", label: "场景 · 深夜办公室", detail: "", tab: "场景" },
      { icon: "🎵", label: "BGM · 逆袭情绪版", detail: "", tab: "全部" },
      { icon: "🧠", label: "知识库 · 红果爆款结构V4", detail: "", tab: "全部" },
      { icon: "🧩", label: "Skill · 24集短剧节奏模板", detail: "", tab: "全部" },
      { icon: "📄", label: "商品资料 · 无", detail: "本项目不关联商品", tab: "全部" },
      { icon: "📋", label: "项目 Brief", detail: "女性逆袭、职场重生、强情绪钩子", tab: "全部" },
      { icon: "🔥", label: "热点资料 · trend-2", detail: "红果女性重生短剧", tab: "全部" },
    ],
  };
}

function fallbackAssetLibrary(projectId) {
  return [
    { icon: "📋", label: "项目 Brief", detail: "待补充", tab: "全部" },
    { icon: "🧠", label: "知识库 · Studio 通用生产规范", detail: "", tab: "全部" },
    { icon: "🧩", label: "Skill · 通用生产 Skill 包", detail: "", tab: "全部" },
    { icon: "🎵", label: "BGM · 待选择", detail: "", tab: "全部" },
  ].map((a) => ({ ...a, projectId }));
}

const repository = createLocalRepository("studio.director", () => ({
  stages: { "proj-7": proj1Stages() },
  shots: { "proj-7": proj1Shots() },
  assets: seedAssetLibrary(),
}));

export function getDirectorProjectState(projectId) {
  const state = repository.get();
  const stages = state.stages[projectId] ?? defaultStageState(projectId);
  const shots = state.shots[projectId] ?? defaultShots(projectId);
  const assets = state.assets[projectId] ?? fallbackAssetLibrary(projectId);
  return tagDemo({ stages, shots, assets });
}

export async function setActiveStage(projectId, stageKey) {
  await simulateLatency(150, 300);
  return repository.update((state) => {
    const stages = state.stages[projectId] ?? defaultStageState(projectId);
    return {
      ...state,
      stages: {
        ...state.stages,
        [projectId]: stages.map((s) => (s.stageKey === stageKey && s.status === "pending" ? { ...s, status: "in_progress" } : s)),
      },
    };
  });
}

export async function lockStageAndContinue(projectId, stageKey) {
  await simulateLatency(300, 600);
  return repository.update((state) => {
    const stages = state.stages[projectId] ?? defaultStageState(projectId);
    const idx = stages.findIndex((s) => s.stageKey === stageKey);
    const nextStages = stages.map((s, i) => {
      if (i === idx) return { ...s, status: "locked", runLog: [...s.runLog, "已人工锁定并继续下一阶段"] };
      if (i === idx + 1 && s.status === "pending") return { ...s, status: "in_progress" };
      return s;
    });
    return { ...state, stages: { ...state.stages, [projectId]: nextStages } };
  });
}

export async function regenerateStage(projectId, stageKey) {
  await simulateLatency(400, 800);
  return repository.update((state) => {
    const stages = state.stages[projectId] ?? defaultStageState(projectId);
    return {
      ...state,
      stages: {
        ...state.stages,
        [projectId]: stages.map((s) =>
          s.stageKey === stageKey
            ? { ...s, tokenCost: s.tokenCost + 800, lastRunAt: new Date().toISOString(), runLog: [...s.runLog, `重新生成 · ${new Date().toLocaleTimeString("zh-CN")}`] }
            : s
        ),
      },
    };
  });
}

export async function updateShot(projectId, shotId, patch) {
  await simulateLatency(200, 400);
  return repository.update((state) => {
    const shots = state.shots[projectId] ?? defaultShots(projectId);
    return { ...state, shots: { ...state.shots, [projectId]: shots.map((s) => (s.shotId === shotId ? { ...s, ...patch } : s)) } };
  });
}

export async function addShot(projectId, afterOrder) {
  await simulateLatency(300, 600);
  return repository.update((state) => {
    const shots = state.shots[projectId] ?? defaultShots(projectId);
    const newShot = {
      shotId: nextMockId("shot"), projectId, order: afterOrder + 0.5,
      shotType: "新增镜头", shotSize: "中景", description: "由分镜 Agent 补充生成，请编辑镜头描述。",
      characters: [], action: "", expression: "", dialogue: "", narration: "", cameraMovement: "固定",
      scene: shots[0]?.scene ?? "待定", lighting: "冷色顶光", style: "都市悬疑写实", aspectRatio: "9:16",
      generationModel: "Video Model A · 电影感", cost: 0, consistencyScore: 0, platformRisk: "低",
      agentSuggestion: "", durationSeconds: 2, status: "draft",
    };
    const next = [...shots, newShot].sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i + 1 }));
    return { ...state, shots: { ...state.shots, [projectId]: next } };
  });
}

export async function removeShot(projectId, shotId) {
  await simulateLatency(200, 400);
  return repository.update((state) => {
    const shots = state.shots[projectId] ?? defaultShots(projectId);
    const next = shots.filter((s) => s.shotId !== shotId).map((s, i) => ({ ...s, order: i + 1 }));
    return { ...state, shots: { ...state.shots, [projectId]: next } };
  });
}

export async function reorderShot(projectId, shotId, direction) {
  await simulateLatency(150, 300);
  return repository.update((state) => {
    const shots = [...(state.shots[projectId] ?? defaultShots(projectId))].sort((a, b) => a.order - b.order);
    const idx = shots.findIndex((s) => s.shotId === shotId);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= shots.length) return state;
    [shots[idx], shots[swapIdx]] = [shots[swapIdx], shots[idx]];
    const next = shots.map((s, i) => ({ ...s, order: i + 1 }));
    return { ...state, shots: { ...state.shots, [projectId]: next } };
  });
}

export async function regenerateShot(projectId, shotId) {
  await simulateLatency(400, 900);
  return repository.update((state) => {
    const shots = state.shots[projectId] ?? defaultShots(projectId);
    return {
      ...state,
      shots: {
        ...state.shots,
        [projectId]: shots.map((s) => (s.shotId === shotId ? { ...s, status: "generated", cost: s.cost + 3.6, consistencyScore: Math.min(99, s.consistencyScore + 2) } : s)),
      },
    };
  });
}

export async function lockShot(projectId, shotId) {
  await simulateLatency(150, 300);
  return repository.update((state) => {
    const shots = state.shots[projectId] ?? defaultShots(projectId);
    return { ...state, shots: { ...state.shots, [projectId]: shots.map((s) => (s.shotId === shotId ? { ...s, status: "locked" } : s)) } };
  });
}
