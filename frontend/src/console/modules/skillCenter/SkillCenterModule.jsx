import { useMemo } from "react";
import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";
import { filterByScope } from "../../shared/capabilityScope.js";
import { CAPABILITY_SCOPE_OPTIONS } from "../../../demoData/capabilityDemoData.js";

const repo = createAssetRepository("founder.skillCenter", () => [
  {
    name: "多平台商品发布",
    description: "把商品信息适配到抖音/淘宝/小红书各自的字段格式并发布",
    status: "published",
    tags: ["商品"],
    fields: {
      inputSchema: "{ name, price, images[], category }",
      outputSchema: "{ platformListingId, status }",
      dependencies: "抖音开放平台连接器、淘宝开放平台连接器",
      applicableAgent: "产品 Agent",
      testStatus: "通过",
      permissionScope: "商品读写",
      scope: "founder",
    },
  },
  {
    name: "订单异常检测",
    description: "扫描订单，标记超时未发货/退款异常",
    status: "published",
    tags: ["订单"],
    fields: {
      inputSchema: "{ orders[] }",
      outputSchema: "{ flaggedOrderIds[] }",
      dependencies: "订单中心数据源",
      applicableAgent: "履约 Agent",
      testStatus: "通过",
      permissionScope: "订单只读",
      scope: "founder",
    },
  },
  {
    name: "库存补货建议",
    description: "根据历史销量和当前库存计算补货建议",
    status: "draft",
    tags: ["商品", "库存"],
    fields: {
      inputSchema: "{ sku, currentStock, avgDailySales }",
      outputSchema: "{ suggestedQty }",
      dependencies: "无",
      applicableAgent: "补货建议 Agent",
      testStatus: "待测试",
      permissionScope: "商品只读",
      scope: "operator",
    },
  },
  {
    name: "分镜脚本质检",
    description: "按内容规范检查分镜脚本是否有违禁词/结构缺失",
    status: "published",
    tags: ["内容"],
    fields: {
      inputSchema: "{ script }",
      outputSchema: "{ passed, issues[] }",
      dependencies: "平台发布规则手册（知识中心）",
      applicableAgent: "编剧 Agent",
      testStatus: "通过",
      permissionScope: "内容只读",
      scope: "studio",
    },
  },
]);

const TEST_STATUS_OPTIONS = [
  { value: "待测试", label: "待测试" },
  { value: "测试中", label: "测试中" },
  { value: "通过", label: "通过" },
  { value: "未通过", label: "未通过" },
];

const FIELD_SCHEMA = [
  { key: "scope", label: "适用版本", type: "select", default: "founder", options: CAPABILITY_SCOPE_OPTIONS.filter((o) => o.key !== "all").map((o) => ({ value: o.key, label: o.label })) },
  { key: "inputSchema", label: "输入结构" },
  { key: "outputSchema", label: "输出结构" },
  { key: "dependencies", label: "依赖", placeholder: "依赖的连接器/知识文档/其它 Skill，无则填「无」" },
  { key: "applicableAgent", label: "适用 Agent", placeholder: "例如：产品 Agent" },
  { key: "testStatus", label: "测试状态", type: "select", default: "待测试", options: TEST_STATUS_OPTIONS },
  { key: "permissionScope", label: "权限范围", placeholder: "例如：商品读写" },
];

/**
 * 中文框架审查版补充：适用版本（scope）字段 + 顶部版本范围选择器
 * 过滤（由 SkillCenterWorkbench 持有状态并传入）、依赖/适用 Agent/
 * 测试状态/权限范围字段。AssetCenterModule 本身保持通用不改动。
 */
export function SkillCenterModule({ scope = "all" }) {
  const scopedRepo = useMemo(
    () => ({ ...repo, list: (opts) => filterByScope(repo.list(opts), scope) }),
    [scope]
  );

  return (
    <AssetCenterModule
      moduleKey="skillCenter"
      title="Skill 中心"
      subtitle="Agent 可调用的原子能力清单——能力说明、输入/输出、依赖、权限范围、测试状态、版本、发布状态"
      repo={scopedRepo}
      fieldSchema={FIELD_SCHEMA}
      itemLabel="Skill"
    />
  );
}
