import { useMemo } from "react";
import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";
import { filterByScope } from "../../shared/capabilityScope.js";
import { CAPABILITY_SCOPE_OPTIONS } from "../../../demoData/capabilityDemoData.js";

const repo = createAssetRepository("founder.promptCenter", () => [
  {
    name: "商品详情文案生成",
    description: "根据商品基础信息生成电商详情页文案",
    status: "published",
    tags: ["商品", "文案"],
    fields: {
      template: "请为{{商品名称}}生成一段吸引人的详情页文案，突出{{核心卖点}}。",
      variables: "商品名称、核心卖点",
      linkedAgent: "产品 Agent",
      scope: "founder",
      approvalStatus: "approved",
    },
  },
  {
    name: "客服回复草稿",
    description: "针对差评/售后场景生成客服回复草稿",
    status: "published",
    tags: ["客服"],
    fields: {
      template: "针对客户反馈「{{反馈内容}}」，生成一条礼貌、解决问题导向的回复草稿。",
      variables: "反馈内容",
      linkedAgent: "销售 Agent",
      scope: "founder",
      approvalStatus: "approved",
    },
  },
  {
    name: "广告投放建议",
    description: "根据 ROAS 和预算数据生成投放调整建议",
    status: "draft",
    tags: ["广告"],
    fields: {
      template: "根据计划「{{计划名称}}」近 7 天 ROAS={{roas}}，生成投放调整建议。",
      variables: "计划名称、roas",
      linkedAgent: "广告 Agent",
      scope: "founder",
      approvalStatus: "pending",
    },
  },
  {
    name: "短剧分镜脚本生成",
    description: "根据选题大纲生成分镜级短剧脚本初稿",
    status: "published",
    tags: ["内容"],
    fields: {
      template: "根据选题「{{选题}}」和目标时长{{时长}}秒，生成分镜脚本初稿。",
      variables: "选题、时长",
      linkedAgent: "编剧 Agent",
      scope: "studio",
      approvalStatus: "approved",
    },
  },
]);

const APPROVAL_OPTIONS = [
  { value: "pending", label: "待审批" },
  { value: "approved", label: "已批准" },
  { value: "rejected", label: "已驳回" },
];

const FIELD_SCHEMA = [
  { key: "scope", label: "适用版本", type: "select", default: "founder", options: CAPABILITY_SCOPE_OPTIONS.filter((o) => o.key !== "all").map((o) => ({ value: o.key, label: o.label })) },
  { key: "template", label: "Prompt 模板", type: "textarea", placeholder: "支持 {{变量}} 占位符" },
  { key: "variables", label: "变量", placeholder: "例如：商品名称、核心卖点（用顿号或逗号分隔）" },
  { key: "linkedAgent", label: "适用 Agent", placeholder: "例如：产品 Agent" },
  { key: "approvalStatus", label: "审批状态", type: "select", default: "pending", options: APPROVAL_OPTIONS },
];

/** 使用记录——演示数据，展示 Prompt 最近被哪些 Agent 调用、结果与成本。 */
const USAGE_LOG = [
  { id: "u1", promptName: "商品详情文案生成", agent: "产品 Agent", at: new Date(Date.now() - 1800_000).toISOString(), result: "成功", cost: 0.08 },
  { id: "u2", promptName: "客服回复草稿", agent: "销售 Agent", at: new Date(Date.now() - 5400_000).toISOString(), result: "成功", cost: 0.05 },
  { id: "u3", promptName: "广告投放建议", agent: "广告 Agent", at: new Date(Date.now() - 9000_000).toISOString(), result: "失败·已重试", cost: 0.03 },
];

function PromptUsageLog() {
  return (
    <div className="fdr-card">
      <h3 className="fdr-card__title">使用记录</h3>
      <DataTable
        columns={[
          { key: "promptName", label: "Prompt" },
          { key: "agent", label: "调用 Agent" },
          { key: "at", label: "调用时间", render: (r) => new Date(r.at).toLocaleString("zh-CN") },
          { key: "result", label: "结果", render: (r) => <StatusPill tone={r.result === "成功" ? "success" : "warning"}>{r.result}</StatusPill> },
          { key: "cost", label: "成本", render: (r) => `¥${r.cost.toFixed(2)}` },
        ]}
        rows={USAGE_LOG}
        emptyMessage="暂无调用记录"
      />
    </div>
  );
}

/**
 * 中文框架审查版补充：顶部版本范围选择器（由 PromptCenterWorkbench
 * 统一持有状态并传入 `scope`），审批状态字段，以及列表下方的
 * 使用记录——AssetCenterModule 本身保持通用不改动，这里只是在外面
 * 包一层 scope 过滤后的 repo + 追加使用记录板块。
 */
export function PromptCenterModule({ scope = "all" }) {
  const scopedRepo = useMemo(
    () => ({ ...repo, list: (opts) => filterByScope(repo.list(opts), scope) }),
    [scope]
  );

  return (
    <div>
      <AssetCenterModule
        moduleKey="promptCenter"
        title="Prompt 中心"
        subtitle="跨 Agent 复用的 Prompt 模板库——版本、变量、审批状态、发布状态、关联 Agent"
        repo={scopedRepo}
        fieldSchema={FIELD_SCHEMA}
        itemLabel="Prompt"
      />
      <PromptUsageLog />
    </div>
  );
}
