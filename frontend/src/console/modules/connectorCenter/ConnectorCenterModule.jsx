import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";

const repo = createAssetRepository("founder.connectorCenter", () => [
  {
    name: "抖音开放平台",
    description: "商品/订单/物流 API 接入",
    status: "published",
    tags: ["电商平台"],
    fields: { platform: "douyin", authStatus: "已授权", lastSyncAt: new Date(Date.now() - 3600000).toISOString() },
  },
  {
    name: "淘宝开放平台",
    description: "商品/订单 API 接入",
    status: "published",
    tags: ["电商平台"],
    fields: { platform: "taobao", authStatus: "已授权", lastSyncAt: new Date(Date.now() - 7200000).toISOString() },
  },
  {
    name: "企业微信客服",
    description: "客服会话同步",
    status: "draft",
    tags: ["客服"],
    fields: { platform: "wecom", authStatus: "未连接", lastSyncAt: null },
  },
]);

const FIELD_SCHEMA = [
  { key: "platform", label: "平台标识" },
  { key: "authStatus", label: "授权状态" },
];

export function ConnectorCenterModule() {
  return (
    <AssetCenterModule
      moduleKey="connectorCenter"
      title="Connector 中心"
      subtitle="Founder 侧管理的平台/系统连接器——授权状态、同步时间"
      repo={repo}
      fieldSchema={FIELD_SCHEMA}
      itemLabel="连接器"
    />
  );
}
