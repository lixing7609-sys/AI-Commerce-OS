import { useState } from "react";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import {
  CAPABILITIES,
  getCapabilityStatusLabel,
  getCapabilityStatusTone,
  getStoreConnectorState,
  simulateReconnect,
  simulateTestConnection,
} from "../../mock/platformConnectorMock.js";
import { getPlatformLabel, getAuthTypeLabel, getConnectionStatusLabel } from "../../../components/shops/shopLabels.js";

/**
 * 店铺详情 →「平台连接器」标签页（阶段：Founder Store Center IA
 * 精修）。取代之前店铺中心顶部"统一平台连接器"面板——那个面板把
 * 所有店铺的连接状态平铺展示在一起，脱离了具体店铺上下文。现在
 * 每个店铺进入自己的详情页后，才能看到、管理"这一个店铺"的连接器。
 *
 * 与相邻两个标签页的边界（不重复彼此的信息）：
 *   链接与授权：账号身份/授权方式/凭据是否已配置/上次测试结果——
 *     真实数据，直接读 shop 本身的字段，本组件不重复维护一份。
 *   平台连接器（本组件）：连接器类型/版本/健康度/能力矩阵/同步
 *     状态——原型/模拟数据，明确标注，不声称已真实接入。
 *   任务：连接器驱动的具体执行实例（商品同步/库存同步/订单拉取
 *     等），本组件不展示任务历史，只展示"连接器本身"的状态。
 */

const HEALTH_LABEL = { healthy: "健康", warning: "需关注", error: "异常", unknown: "未知" };
const HEALTH_TONE = { healthy: "success", warning: "warning", error: "danger", unknown: "neutral" };
const FRESHNESS_LABEL = { fresh: "新鲜", delayed: "延迟", stale: "过期", unknown: "未知" };
const WEBHOOK_LABEL = { active: "正常", degraded: "降级", mock: "模拟", unsupported: "平台不支持" };
const RATE_LIMIT_LABEL = { normal: "正常", throttled: "已限流", unknown: "未知" };
const INTEGRATION_MODE_LABEL = { api: "真实 API 对接", hybrid: "部分真实 / 部分模拟", mock: "完全模拟" };
const ENVIRONMENT_LABEL = { sandbox: "沙箱环境", production: "生产环境", mock: "模拟环境" };

function formatDateTime(value) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  return date.toLocaleString("zh-CN");
}

function AuthContextBanner({ shop, onGoToAuth }) {
  const status = shop.connection_status;
  if (status === "not_configured") {
    return (
      <div className="fdr-card" style={{ borderColor: "var(--warning, #f59e0b)", background: "rgba(245,158,11,.06)" }}>
        <StatusPill tone="warning">尚未完成链接与授权</StatusPill>{" "}
        <span style={{ fontSize: 13 }}>
          该店铺尚未在「链接与授权」配置凭据，以下能力矩阵为该平台连接器的原型能力预览，实际连接需要先完成授权。
        </span>{" "}
        <Button size="sm" variant="secondary" onClick={onGoToAuth}>去链接与授权</Button>
      </div>
    );
  }
  if (status === "expired") {
    return (
      <div className="fdr-card" style={{ borderColor: "var(--danger)", background: "rgba(239,68,68,.06)" }}>
        <StatusPill tone="danger">授权已过期</StatusPill>{" "}
        <span style={{ fontSize: 13 }}>该店铺的平台授权已过期，需要重新授权后连接器才能正常同步。</span>{" "}
        <Button size="sm" variant="secondary" onClick={onGoToAuth}>去链接与授权</Button>
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="fdr-card" style={{ borderColor: "var(--danger)", background: "rgba(239,68,68,.06)" }}>
        <StatusPill tone="danger">连接异常</StatusPill>{" "}
        <span style={{ fontSize: 13 }}>该店铺当前连接状态异常，建议前往「链接与授权」重新测试连接。</span>{" "}
        <Button size="sm" variant="secondary" onClick={onGoToAuth}>去链接与授权</Button>
      </div>
    );
  }
  return null;
}

function CapabilityDetailModal({ open, onClose, connector, capabilityKey, onReconnect, reconnecting }) {
  if (!connector || !capabilityKey) return null;
  const capability = CAPABILITIES.find((c) => c.key === capabilityKey);
  const status = connector.grantedCapabilities[capabilityKey];

  return (
    <Modal
      open={open}
      title={`${connector.accountLabel} · ${capability?.label}`}
      onClose={onClose}
      footer={
        <Button variant="primary" disabled={reconnecting} onClick={() => onReconnect(capabilityKey)}>
          {reconnecting ? "重新连接中…" : "模拟重新连接"}
        </Button>
      }
    >
      <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>能力</dt><dd style={{ margin: 0 }}>{capability?.label}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>状态</dt><dd style={{ margin: 0 }}><StatusPill tone={getCapabilityStatusTone(status)}>{getCapabilityStatusLabel(status)}</StatusPill></dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>连接器类型</dt><dd style={{ margin: 0 }}>{connector.connectorType}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>集成模式</dt><dd style={{ margin: 0 }}>{INTEGRATION_MODE_LABEL[connector.integrationMode]}</dd></div>
      </dl>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 12 }}>模拟操作，不会调用任何真实平台接口。</p>
    </Modal>
  );
}

export function PlatformConnectorTab({ shop, onGoToAuth }) {
  const toast = useToast();
  const [detailCapabilityKey, setDetailCapabilityKey] = useState(null);
  const [reconnecting, setReconnecting] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connector, setConnector] = useState(() => getStoreConnectorState(shop));

  if (!shop) {
    return <EmptyState icon="○" message="店铺信息加载中…" />;
  }

  if (!connector) {
    return (
      <EmptyState
        icon="⚠"
        message="尚未配置平台连接器"
        action={<Button variant="secondary" onClick={onGoToAuth}>去链接与授权</Button>}
      />
    );
  }

  async function handleReconnect(capabilityKey) {
    setReconnecting(true);
    const next = await simulateReconnect(shop.id, capabilityKey);
    setConnector(next);
    setReconnecting(false);
    toast("已模拟重新连接（演示，未连接真实平台）", "success");
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    const next = await simulateTestConnection(shop.id);
    setConnector(next);
    setTestingConnection(false);
    toast("已模拟测试连接（演示，未连接真实平台）", "success");
  }

  return (
    <div>
      <AuthContextBanner shop={shop} onGoToAuth={onGoToAuth} />

      {connector.warning ? (
        <div className="fdr-card" style={{ borderColor: "var(--warning, #f59e0b)", background: "rgba(245,158,11,.06)" }}>
          <StatusPill tone="warning">连接器提醒</StatusPill> <span style={{ fontSize: 13 }}>{connector.warning}</span>
        </div>
      ) : null}

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>连接器概况</h3>
          <DemoBadge />
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, fontSize: 13, marginTop: 8 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{shop.shop_name}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>电商平台</dt><dd style={{ margin: 0 }}>{getPlatformLabel(shop.platform)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台账号</dt><dd style={{ margin: 0 }}>{connector.accountLabel}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>连接器类型</dt><dd style={{ margin: 0 }}>{connector.connectorType}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>连接器版本</dt><dd style={{ margin: 0 }}>{connector.connectorVersion}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>集成模式</dt><dd style={{ margin: 0 }}>{INTEGRATION_MODE_LABEL[connector.integrationMode]}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>授权关系</dt><dd style={{ margin: 0 }}>{getAuthTypeLabel(shop.auth_type)} · {getConnectionStatusLabel(shop.connection_status)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>健康状态</dt><dd style={{ margin: 0 }}><StatusPill tone={HEALTH_TONE[connector.healthStatus]}>{HEALTH_LABEL[connector.healthStatus]}</StatusPill></dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>上次检查时间</dt><dd style={{ margin: 0 }}>{formatDateTime(connector.lastHealthCheckAt)}</dd></div>
        </dl>
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>能力矩阵</h3>
          <DemoBadge />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8, marginTop: 8 }}>
          {CAPABILITIES.map((cap) => {
            const status = connector.grantedCapabilities[cap.key];
            return (
              <button
                key={cap.key}
                type="button"
                onClick={() => setDetailCapabilityKey(cap.key)}
                style={{
                  textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)",
                  background: "var(--surface)", cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{cap.label}</div>
                <StatusPill tone={getCapabilityStatusTone(status)}>{getCapabilityStatusLabel(status)}</StatusPill>
              </button>
            );
          })}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">同步与健康度</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, fontSize: 13 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>上次成功同步</dt><dd style={{ margin: 0 }}>{formatDateTime(connector.lastSuccessfulSyncAt)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>上次失败同步</dt><dd style={{ margin: 0 }}>{formatDateTime(connector.lastFailedSyncAt)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>数据新鲜度</dt><dd style={{ margin: 0 }}>{FRESHNESS_LABEL[connector.dataFreshness]}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>Webhook 状态</dt><dd style={{ margin: 0 }}>{WEBHOOK_LABEL[connector.webhookStatus]}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>限流状态</dt><dd style={{ margin: 0 }}>{RATE_LIMIT_LABEL[connector.rateLimitState]}</dd></div>
        </dl>
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <Button variant="secondary" disabled={testingConnection} onClick={handleTestConnection}>
            {testingConnection ? "测试中…" : "测试连接（模拟）"}
          </Button>
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">配置概览</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, fontSize: 13 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>执行环境</dt><dd style={{ margin: 0 }}>{ENVIRONMENT_LABEL[connector.environment]}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>自动重试</dt><dd style={{ margin: 0 }}>{connector.retryPolicy.autoRetry ? "已开启" : "未开启"}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>最大重试次数</dt><dd style={{ margin: 0 }}>{connector.retryPolicy.maxRetries}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>重试退避时长</dt><dd style={{ margin: 0 }}>{connector.retryPolicy.backoffSeconds} 秒</dd></div>
        </dl>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 8 }}>
          以上均为原型配置展示，不代表已连接真实平台 API；真实凭据与授权状态见「链接与授权」标签页。
        </p>
      </div>

      <CapabilityDetailModal
        open={!!detailCapabilityKey}
        onClose={() => setDetailCapabilityKey(null)}
        connector={connector}
        capabilityKey={detailCapabilityKey}
        onReconnect={handleReconnect}
        reconnecting={reconnecting}
      />
    </div>
  );
}
