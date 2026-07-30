import { useState } from "react";
import {
  PageHeader,
  StatGrid,
  StatCard,
  DataTable,
  StatusPill,
  DemoBadge,
  Button,
  AIRiskAlert,
  ErrorState,
  Drawer,
  KeyValueList,
  ProgressBar,
} from "../../kit/index.js";
import { getCloudStatusSummary } from "../founderWorkspace/workspaceEntities.js";
import { getFeaturedDevice } from "../../../demoData/founderDemoData.js";
import { getCloudState, getCloudOverviewMetrics } from "../../../cloud/mock/cloudMock.js";
import {
  DrillDownLink,
  WorkspaceLoadingSkeleton,
  RestrictedAction,
} from "../founderWorkspace/WorkspaceKit.jsx";
import { useDemoLoading, useDemoRefreshFailure } from "../founderWorkspace/useWorkspaceDemoState.js";
import { useToast } from "../../kit/useToast.js";

const HEALTH_LABEL = { healthy: "健康", attention: "需关注", offline: "离线" };
const HEALTH_TONE = { healthy: "success", attention: "warning", offline: "danger" };
const LICENSE_LABEL = { active: "生效中", suspended: "已暂停" };
const LICENSE_TONE = { active: "success", suspended: "danger" };

function formatTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-CN");
}

/**
 * Founder Workspace · 云端状态 — read-only summary pulled from Cloud
 * Center's own data (Charter §3.1); does not re-implement fleet
 * management, only surfaces it with a drill-down. Uses the exact same
 * getCloudOverviewMetrics() that Cloud Center's own overview page
 * reads (cloud/cloudPages.jsx) so the two numbers can never drift, and
 * anchors 节点状态 to the same featured device used elsewhere in
 * Founder.
 */
export function CloudStatusModule() {
  const loading = useDemoLoading();
  const { failed, triggerRefresh } = useDemoRefreshFailure();
  const showToast = useToast();

  const summary = getCloudStatusSummary();
  const metrics = getCloudOverviewMetrics();
  const { devices, operators, licenses, tokenMetering } = getCloudState();
  const featuredDevice = getFeaturedDevice();

  const [detailDevice, setDetailDevice] = useState(null);

  function handleRefresh() {
    const willSucceed = failed;
    triggerRefresh();
    if (willSucceed) showToast("云端状态已刷新", "success");
  }

  const versionGroups = Object.entries(
    devices.reduce((acc, d) => {
      acc[d.systemVersion] = (acc[d.systemVersion] ?? 0) + 1;
      return acc;
    }, {})
  ).map(([version, count]) => ({ id: version, version, count }));

  const alerts = [
    metrics.abnormalCostGrowth
      ? { level: metrics.abnormalCostGrowth.severity === "warning" ? "medium" : "low", concern: metrics.abnormalCostGrowth.detail }
      : null,
    metrics.offlineDevices > 0 ? { level: "medium", concern: `${metrics.offlineDevices} 台设备当前离线，可能影响该 Operator 的 Agent 任务执行。` } : null,
    metrics.otaFailed > 0 ? { level: "medium", concern: `${metrics.otaFailed} 个 OTA 发布失败，已自动回滚，建议复查更新包。` } : null,
    metrics.openSupportCases > 0 ? { level: "low", concern: `${metrics.openSupportCases} 个技术支持工单尚未关闭。` } : null,
  ].filter(Boolean);

  if (loading) {
    return <WorkspaceLoadingSkeleton title="云端状态" subtitle={summary.summary} />;
  }

  return (
    <div>
      <PageHeader
        title="云端状态"
        subtitle={summary.summary}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <DemoBadge />
            <Button variant="primary" size="sm" onClick={handleRefresh}>刷新云端状态</Button>
            <DrillDownLink module="cloudCenter" subView="overview">进入 Cloud Center →</DrillDownLink>
          </div>
        }
      />
      <StatGrid>
        <StatCard label="设备在线率" value={`${metrics.activeDevices} / ${devices.length}`} />
        <StatCard label="Operator 数量" value={metrics.totalOperators} />
        <StatCard label="License 生效中" value={metrics.licenseActive} />
        <StatCard label="今日 Token 消耗" value={metrics.tokenConsumptionToday.toLocaleString()} />
      </StatGrid>

      {failed ? (
        <div style={{ marginTop: 16 }}>
          <ErrorState message="云端状态刷新失败（演示环境模拟）" detail="GET /api/founder/cloud-status -> 503" onRetry={handleRefresh} />
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 16, marginTop: 16 }}>
            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>节点状态</h3>
              {featuredDevice ? (
                <p className="fdr-type-caption" style={{ color: "var(--text-tertiary)" }}>
                  锚点设备：{featuredDevice.id}（{featuredDevice.model}）— 与设备管理为同一条记录
                </p>
              ) : null}
              <DataTable
                columns={[
                  { key: "id", label: "设备" },
                  { key: "model", label: "型号" },
                  { key: "health", label: "状态", render: (r) => <StatusPill tone={HEALTH_TONE[r.health]}>{HEALTH_LABEL[r.health] ?? r.health}</StatusPill> },
                  { key: "lastHeartbeatAt", label: "最近心跳", render: (r) => formatTime(r.lastHeartbeatAt) },
                ]}
                rows={devices}
                onRowClick={setDetailDevice}
              />
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>版本分布</h3>
              <DataTable
                columns={[
                  { key: "version", label: "系统版本" },
                  { key: "count", label: "设备数" },
                ]}
                rows={versionGroups}
              />
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>许可证状态</h3>
              <DataTable
                columns={[
                  { key: "id", label: "License" },
                  { key: "package", label: "套餐" },
                  { key: "status", label: "状态", render: (r) => <StatusPill tone={LICENSE_TONE[r.status]}>{LICENSE_LABEL[r.status] ?? r.status}</StatusPill> },
                  { key: "expiresAt", label: "到期时间" },
                ]}
                rows={licenses}
              />
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <DrillDownLink module="cloudCenter" subView="licenses">前往许可证管理 →</DrillDownLink>
              </div>
            </div>

            <div className="fdr-card">
              <h3 style={{ marginTop: 0 }}>Token 使用</h3>
              {tokenMetering.byOperator.map((t) => {
                const operator = operators.find((o) => o.id === t.operatorId);
                return (
                  <div key={t.operatorId} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                      <span>{operator?.name ?? t.operatorId}</span>
                      <span className="fdr-tabular-num">{t.tokensUsed.toLocaleString()} / {t.packageAllowance.toLocaleString()}</span>
                    </div>
                    <ProgressBar value={t.tokensUsed} max={t.packageAllowance} tone={t.tokensUsed / t.packageAllowance > 0.85 ? "danger" : "primary"} />
                  </div>
                );
              })}
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <DrillDownLink module="tokenCenter">前往 Token 中心 →</DrillDownLink>
              </div>
            </div>

            <div className="fdr-card" style={{ gridColumn: "1 / -1" }}>
              <h3 style={{ marginTop: 0 }}>告警摘要</h3>
              {alerts.length === 0 ? (
                <p style={{ color: "var(--text-tertiary)", fontSize: 13 }}>当前没有需要关注的云端告警</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {alerts.map((a, i) => <AIRiskAlert key={i} level={a.level} concern={a.concern} />)}
                </div>
              )}
              <div style={{ marginTop: 8, textAlign: "right" }}>
                <RestrictedAction label="导出云端状态报告" />
              </div>
            </div>
          </div>
        </>
      )}

      <Drawer open={!!detailDevice} title={detailDevice?.id} onClose={() => setDetailDevice(null)}
        footer={<DrillDownLink module="cloudCenter" subView="devices">前往设备管理查看完整详情</DrillDownLink>}
      >
        {detailDevice ? (
          <KeyValueList
            items={[
              { label: "型号", value: detailDevice.model },
              { label: "系统版本", value: detailDevice.systemVersion },
              { label: "健康状态", value: HEALTH_LABEL[detailDevice.health] ?? detailDevice.health },
              { label: "Token 余额", value: detailDevice.tokenBalance?.toLocaleString?.() ?? detailDevice.tokenBalance },
              { label: "最近心跳", value: formatTime(detailDevice.lastHeartbeatAt) },
              { label: "更新通道", value: detailDevice.updateChannel },
            ]}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
