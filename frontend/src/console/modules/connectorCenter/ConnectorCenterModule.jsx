import { useMemo, useState } from "react";
import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { useToast } from "../../kit/useToast.js";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";
import { filterByScope } from "../../shared/capabilityScope.js";
import { CAPABILITY_SCOPE_OPTIONS } from "../../../demoData/capabilityDemoData.js";

const repo = createAssetRepository("founder.connectorCenter", () => [
  {
    name: "抖音开放平台",
    description: "商品/订单/物流 API 接入",
    status: "published",
    tags: ["电商平台"],
    fields: {
      platform: "douyin",
      platformCategory: "电商平台",
      connectionStatus: "已连接",
      authStatus: "已授权",
      syncStatus: "已同步",
      permissionScope: "商品读写、订单只读、物流只读",
      configEntry: "系统设置 → 集成 → 抖音开放平台",
      apiEndpoint: "https://open.douyin.com/api/v1",
      webhookUrl: "https://hooks.founder.local/douyin",
      lastSyncAt: new Date(Date.now() - 3600000).toISOString(),
      scope: "founder",
    },
  },
  {
    name: "淘宝开放平台",
    description: "商品/订单 API 接入",
    status: "published",
    tags: ["电商平台"],
    fields: {
      platform: "taobao",
      platformCategory: "电商平台",
      connectionStatus: "已连接",
      authStatus: "已授权",
      syncStatus: "已同步",
      permissionScope: "商品读写、订单只读",
      configEntry: "系统设置 → 集成 → 淘宝开放平台",
      apiEndpoint: "https://eco.taobao.com/router/rest",
      webhookUrl: "https://hooks.founder.local/taobao",
      lastSyncAt: new Date(Date.now() - 7200000).toISOString(),
      scope: "founder",
    },
  },
  {
    name: "企业微信客服",
    description: "客服会话同步",
    status: "draft",
    tags: ["客服"],
    fields: {
      platform: "wecom",
      platformCategory: "客服/IM",
      connectionStatus: "未连接",
      authStatus: "未连接",
      syncStatus: "未同步",
      permissionScope: "会话只读",
      configEntry: "系统设置 → 集成 → 企业微信",
      apiEndpoint: "https://qyapi.weixin.qq.com/cgi-bin",
      webhookUrl: "—",
      lastSyncAt: null,
      scope: "operator",
    },
  },
  {
    name: "云端设备管理平台",
    description: "Operator 设备状态、OTA 更新、许可证同步",
    status: "published",
    tags: ["Cloud"],
    fields: {
      platform: "cloud-fleet",
      platformCategory: "内部系统",
      connectionStatus: "已连接",
      authStatus: "已授权",
      syncStatus: "同步中",
      permissionScope: "设备只读、许可证读写",
      configEntry: "云端中心 → 设备管理 → 连接设置",
      apiEndpoint: "https://cloud.founder.local/api/fleet",
      webhookUrl: "https://hooks.founder.local/cloud-fleet",
      lastSyncAt: new Date(Date.now() - 900000).toISOString(),
      scope: "cloud",
    },
  },
]);

const CONNECTION_STATUS_OPTIONS = [
  { value: "未连接", label: "未连接" },
  { value: "连接中", label: "连接中" },
  { value: "已连接", label: "已连接" },
  { value: "连接异常", label: "连接异常" },
];
const AUTH_STATUS_OPTIONS = [
  { value: "未连接", label: "未连接" },
  { value: "待授权", label: "待授权" },
  { value: "已授权", label: "已授权" },
  { value: "授权已过期", label: "授权已过期" },
];
const SYNC_STATUS_OPTIONS = [
  { value: "未同步", label: "未同步" },
  { value: "同步中", label: "同步中" },
  { value: "已同步", label: "已同步" },
  { value: "同步失败", label: "同步失败" },
];

const FIELD_SCHEMA = [
  { key: "scope", label: "适用版本", type: "select", default: "founder", options: CAPABILITY_SCOPE_OPTIONS.filter((o) => o.key !== "all").map((o) => ({ value: o.key, label: o.label })) },
  { key: "platform", label: "平台标识" },
  { key: "platformCategory", label: "平台分类", placeholder: "例如：电商平台 / 客服/IM / 内部系统" },
  { key: "connectionStatus", label: "连接状态", type: "select", default: "未连接", options: CONNECTION_STATUS_OPTIONS },
  { key: "authStatus", label: "授权状态", type: "select", default: "未连接", options: AUTH_STATUS_OPTIONS },
  { key: "syncStatus", label: "数据同步状态", type: "select", default: "未同步", options: SYNC_STATUS_OPTIONS },
  { key: "permissionScope", label: "权限范围", placeholder: "例如：商品读写、订单只读" },
  { key: "configEntry", label: "配置入口", placeholder: "例如：系统设置 → 集成 → XX 平台" },
  { key: "apiEndpoint", label: "API Endpoint" },
  { key: "webhookUrl", label: "Webhook 地址" },
];

const CONNECTION_TONE = { 未连接: "neutral", 连接中: "info", 已连接: "success", 连接异常: "danger" };
const AUTH_TONE = { 未连接: "neutral", 待授权: "warning", 已授权: "success", 授权已过期: "danger" };
const SYNC_TONE = { 未同步: "neutral", 同步中: "info", 已同步: "success", 同步失败: "danger" };

/** 错误记录——演示数据，Founder 侧允许展示技术诊断细节（区别于 Operator 侧的隐藏策略）。 */
const ERROR_LOG = [
  { id: "e1", connectorName: "企业微信客服", at: new Date(Date.now() - 1800_000).toISOString(), code: "AUTH_EXPIRED", detail: "OAuth Token 已过期，需重新授权" },
  { id: "e2", connectorName: "抖音开放平台", at: new Date(Date.now() - 86400_000).toISOString(), code: "RATE_LIMIT_429", detail: "接口调用频率超限，已自动退避重试" },
];

/**
 * 运维面板——健康检查 / 测试连接 / 错误记录。Connector 中心是 Founder
 * 侧的技术配置中心，交办要求明确保留 API Endpoint / Webhook / 授权 /
 * 诊断信息（与 Operator 侧隐藏这些技术细节不同），所以这里不做任何
 * 技术字段的隐藏处理。
 */
function ConnectorOpsPanel({ connectors }) {
  const toast = useToast();
  const [healthState, setHealthState] = useState({});
  const [testing, setTesting] = useState(null);

  function runHealthCheck(connector) {
    setHealthState((prev) => ({ ...prev, [connector.id]: "checking" }));
    setTimeout(() => {
      const healthy = connector.fields.connectionStatus === "已连接";
      setHealthState((prev) => ({ ...prev, [connector.id]: healthy ? "healthy" : "unhealthy" }));
      toast(`「${connector.name}」健康检查完成：${healthy ? "正常" : "异常"}（本地演示，未发起真实探测请求）`, healthy ? "success" : "warning");
    }, 500);
  }

  function testConnection(connector) {
    setTesting(connector.id);
    setTimeout(() => {
      setTesting(null);
      toast(`「${connector.name}」测试连接完成：${connector.fields.connectionStatus === "已连接" ? "连通正常" : "连接失败，请检查授权状态"}（本地演示）`, connector.fields.connectionStatus === "已连接" ? "success" : "warning");
    }, 600);
  }

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">健康检查 / 测试连接</h3>
        <DataTable
          columns={[
            { key: "name", label: "连接器" },
            { key: "platformCategory", label: "平台分类", render: (r) => r.fields?.platformCategory ?? "—" },
            { key: "connectionStatus", label: "连接状态", render: (r) => <StatusPill tone={CONNECTION_TONE[r.fields?.connectionStatus] ?? "neutral"}>{r.fields?.connectionStatus ?? "—"}</StatusPill> },
            { key: "authStatus", label: "授权状态", render: (r) => <StatusPill tone={AUTH_TONE[r.fields?.authStatus] ?? "neutral"}>{r.fields?.authStatus ?? "—"}</StatusPill> },
            { key: "syncStatus", label: "数据同步", render: (r) => <StatusPill tone={SYNC_TONE[r.fields?.syncStatus] ?? "neutral"}>{r.fields?.syncStatus ?? "—"}</StatusPill> },
            { key: "health", label: "健康状态", render: (r) => healthState[r.id] === "checking" ? <StatusPill tone="info">检查中…</StatusPill> : healthState[r.id] === "healthy" ? <StatusPill tone="success">正常</StatusPill> : healthState[r.id] === "unhealthy" ? <StatusPill tone="danger">异常</StatusPill> : <StatusPill tone="neutral">未检查</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 4 }}>
                  <Button size="sm" variant="secondary" disabled={healthState[r.id] === "checking"} onClick={() => runHealthCheck(r)}>健康检查</Button>
                  <Button size="sm" variant="ghost" disabled={testing === r.id} onClick={() => testConnection(r)}>{testing === r.id ? "测试中…" : "测试连接"}</Button>
                </div>
              ),
            },
          ]}
          rows={connectors}
          emptyMessage="该版本范围下暂无连接器"
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">技术诊断信息（API / Webhook / 权限范围 / 配置入口）</h3>
        <DataTable
          columns={[
            { key: "name", label: "连接器" },
            { key: "apiEndpoint", label: "API Endpoint", render: (r) => r.fields?.apiEndpoint ?? "—" },
            { key: "webhookUrl", label: "Webhook 地址", render: (r) => r.fields?.webhookUrl ?? "—" },
            { key: "permissionScope", label: "权限范围", render: (r) => r.fields?.permissionScope ?? "—" },
            { key: "configEntry", label: "配置入口", render: (r) => r.fields?.configEntry ?? "—" },
            { key: "lastSyncAt", label: "最近同步时间", render: (r) => (r.fields?.lastSyncAt ? new Date(r.fields.lastSyncAt).toLocaleString("zh-CN") : "—") },
          ]}
          rows={connectors}
          emptyMessage="该版本范围下暂无连接器"
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">错误记录</h3>
        <DataTable
          columns={[
            { key: "connectorName", label: "连接器" },
            { key: "at", label: "时间", render: (r) => new Date(r.at).toLocaleString("zh-CN") },
            { key: "code", label: "错误代码" },
            { key: "detail", label: "详情" },
          ]}
          rows={ERROR_LOG}
          emptyMessage="暂无错误记录"
        />
      </div>
    </div>
  );
}

/**
 * 中文框架审查版补充：适用版本字段 + 顶部版本范围选择器过滤、
 * 平台分类/连接状态/数据同步/权限范围/配置入口/API Endpoint/
 * Webhook 字段，以及健康检查/测试连接/错误记录运维面板。
 * AssetCenterModule 本身保持通用不改动。
 */
export function ConnectorCenterModule() {
  const [scope, setScope] = useState("all");
  const allConnectors = repo.list({});
  const scopedRepo = useMemo(
    () => ({ ...repo, list: (opts) => filterByScope(repo.list(opts), scope) }),
    [scope]
  );
  const scopedConnectors = filterByScope(allConnectors, scope);

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={setScope} activeStage="配置" />
      <div style={{ margin: "12px 0" }}>
        <AssetCenterModule
          moduleKey="connectorCenter"
          title="Connector 中心"
          subtitle="Founder 侧管理的平台/系统连接器——平台分类、连接与授权状态、数据同步、权限范围、配置入口（技术配置中心，展示 API/Webhook/诊断信息）"
          repo={scopedRepo}
          fieldSchema={FIELD_SCHEMA}
          itemLabel="连接器"
        />
      </div>

      <ConnectorOpsPanel connectors={scopedConnectors} />
    </div>
  );
}
