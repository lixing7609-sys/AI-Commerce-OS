const TYPE_NAMES = {
  decision: "决策", project: "项目", agent: "智能体", skill: "技能",
  workflow: "工作流", prompt: "提示词", knowledge: "知识",
  capability: "能力", connector: "连接器",
};

const SHORT_DRAMA_NAMES = {
  project: "AI短剧生产系统",
  workflow: "AI短剧生产主流程",
  prompt: "AI短剧生成 Prompt",
  capability: "AI短剧生成能力",
  knowledge: "AI短剧生产知识",
  decision: "AI短剧生产方案决策",
  skill: "AI短剧生成 Skill",
  agent: "AI短剧生产 Agent",
  connector: "AI短剧生产 Connector",
};

export function businessAssetName(item = {}) {
  const raw = String(item.name || item.asset_name || item.title || "").trim();
  const purpose = String(item.purpose || item.description || "");
  const combined = `${raw} ${purpose}`;
  if (/AI\s*短剧|短剧生产|短剧生成/i.test(combined) && (raw.length > 28 || /验证.*可行性|跑通|建立一套/.test(raw))) {
    return SHORT_DRAMA_NAMES[item.asset_type || item.object_type] || "AI短剧生产资产";
  }
  if (!raw) return `未命名${TYPE_NAMES[item.asset_type || item.object_type] || "资产"}`;
  return raw.length > 34 ? `${raw.slice(0, 32).replace(/[，。；：、,.!?]+$/, "")}…` : raw;
}

export function businessPurpose(item = {}) {
  const purpose = String(item.purpose || item.description || "").trim();
  if (purpose) return purpose;
  const raw = String(item.name || item.asset_name || "");
  return raw.length > 34 ? raw : "尚未形成用途说明；可继续与 Sino 讨论完善。";
}

export function isDeveloperRecord(item = {}) {
  return item.is_test === true || item.test_only === true || item.provenance === "test" || item.metadata?.environment === "test";
}

export function executionBusinessName(item = {}) {
  const assetName = businessAssetName({ ...item, name: item.asset_name });
  if (item.asset_id) return `${assetName} · 执行`;
  return item.name || item.title || `Legacy Execution · ${String(item.execution_id || "").slice(-8)}`;
}

export function referenceSummary(refs = []) {
  if (!refs?.length) return "暂无";
  return refs.map((ref) => typeof ref === "string" ? ref : ref.name || ref.target_id || ref.asset_id || ref.object_id || ref.reference_id || "关联记录").join(" · ");
}
