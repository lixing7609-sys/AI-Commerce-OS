import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";

const repo = createAssetRepository("founder.promptCenter", () => [
  {
    name: "商品详情文案生成",
    description: "根据商品基础信息生成电商详情页文案",
    status: "published",
    tags: ["商品", "文案"],
    fields: { template: "请为{{商品名称}}生成一段吸引人的详情页文案，突出{{核心卖点}}。", linkedAgent: "产品 Agent" },
  },
  {
    name: "客服回复草稿",
    description: "针对差评/售后场景生成客服回复草稿",
    status: "published",
    tags: ["客服"],
    fields: { template: "针对客户反馈「{{反馈内容}}」，生成一条礼貌、解决问题导向的回复草稿。", linkedAgent: "销售 Agent" },
  },
  {
    name: "广告投放建议",
    description: "根据 ROAS 和预算数据生成投放调整建议",
    status: "draft",
    tags: ["广告"],
    fields: { template: "根据计划「{{计划名称}}」近 7 天 ROAS={{roas}}，生成投放调整建议。", linkedAgent: "广告 Agent" },
  },
]);

const FIELD_SCHEMA = [
  { key: "template", label: "Prompt 模板", type: "textarea", placeholder: "支持 {{变量}} 占位符" },
  { key: "linkedAgent", label: "关联 Agent", placeholder: "例如：产品 Agent" },
];

export function PromptCenterModule() {
  return (
    <AssetCenterModule
      moduleKey="promptCenter"
      title="Prompt 中心"
      subtitle="跨 Agent 复用的 Prompt 模板库——版本、状态、关联 Agent"
      repo={repo}
      fieldSchema={FIELD_SCHEMA}
      itemLabel="Prompt"
    />
  );
}
