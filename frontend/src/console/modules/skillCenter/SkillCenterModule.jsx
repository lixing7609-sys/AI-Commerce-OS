import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";

const repo = createAssetRepository("founder.skillCenter", () => [
  {
    name: "多平台商品发布",
    description: "把商品信息适配到抖音/淘宝/小红书各自的字段格式并发布",
    status: "published",
    tags: ["商品"],
    fields: { inputSchema: "{ name, price, images[], category }", outputSchema: "{ platformListingId, status }" },
  },
  {
    name: "订单异常检测",
    description: "扫描订单，标记超时未发货/退款异常",
    status: "published",
    tags: ["订单"],
    fields: { inputSchema: "{ orders[] }", outputSchema: "{ flaggedOrderIds[] }" },
  },
  {
    name: "库存补货建议",
    description: "根据历史销量和当前库存计算补货建议",
    status: "draft",
    tags: ["商品", "库存"],
    fields: { inputSchema: "{ sku, currentStock, avgDailySales }", outputSchema: "{ suggestedQty }" },
  },
]);

const FIELD_SCHEMA = [
  { key: "inputSchema", label: "输入结构" },
  { key: "outputSchema", label: "输出结构" },
];

export function SkillCenterModule() {
  return (
    <AssetCenterModule
      moduleKey="skillCenter"
      title="Skill 中心"
      subtitle="Agent 可调用的原子能力清单——输入/输出结构、版本、状态"
      repo={repo}
      fieldSchema={FIELD_SCHEMA}
      itemLabel="Skill"
    />
  );
}
