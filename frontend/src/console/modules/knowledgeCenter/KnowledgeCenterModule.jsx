import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";

const repo = createAssetRepository("founder.knowledgeCenter", () => [
  {
    name: "平台发布规则手册",
    description: "抖音/淘宝/小红书商品发布的平台规则与常见驳回原因",
    status: "published",
    tags: ["合规"],
    fields: { category: "平台规则", sourceType: "内部整理" },
  },
  {
    name: "客服话术规范",
    description: "客服回复的语气、禁用词、升级人工的判断标准",
    status: "published",
    tags: ["客服"],
    fields: { category: "客服规范", sourceType: "内部整理" },
  },
  {
    name: "退款政策 FAQ",
    description: "各平台退款时效与经营者需要承担的责任范围",
    status: "draft",
    tags: ["售后"],
    fields: { category: "政策", sourceType: "待补充" },
  },
]);

const FIELD_SCHEMA = [
  { key: "category", label: "分类" },
  { key: "sourceType", label: "来源类型" },
];

export function KnowledgeCenterModule() {
  return (
    <AssetCenterModule
      moduleKey="knowledgeCenter"
      title="Knowledge 中心"
      subtitle="Agent 检索用的知识文档库——分类、来源、版本、状态"
      repo={repo}
      fieldSchema={FIELD_SCHEMA}
      itemLabel="知识文档"
    />
  );
}
