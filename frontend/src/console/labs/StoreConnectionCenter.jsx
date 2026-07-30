import { useEffect, useState } from "react";
import { PageHeader } from "../kit/PageHeader.jsx";
import { DataTable } from "../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../kit/StatusPill.jsx";
import { Button } from "../kit/Button.jsx";
import { EmptyState } from "../kit/EmptyState.jsx";
import { Modal } from "../kit/Modal.jsx";
import { useToast } from "../kit/useToast.js";
import { getShops } from "../../services/shopApi.js";
import { toPlatformAuthorization } from "../../shared/storePlatform/credentialStore.js";
import { getAdapterForStore, listSyncJobs } from "../../shared/storePlatform/storeConnectionRepository.js";
import { runSync } from "../../shared/storePlatform/syncService.js";
import { OPERATOR_FACING_PLATFORMS } from "../../demoData/operatorDemoData.js";

/**
 * 「平台连接」——经营设置里的店铺授权/同步概览（阶段 Founder Master
 * Edition V1.0 中文框架审查版）。Connector Principle：这里只展示
 * 经营者能理解的信息（平台/店铺名称/授权状态/同步状态/重新授权/
 * 暂停同步），绝不出现接入模式（MODE_MOCK/MODE_LIVE_READONLY 等）、
 * 自动化风险等级（L0-L4）、Feature Flag、原始同步任务状态码等技术
 * 细节——那些属于 Founder 侧的技术连接器视角，不属于 Operator。
 *
 * 之前的实现把这些技术细节直接渲染在这个页面上（接入模式下拉框、
 * 风险等级下拉框、`FEATURE_FLAGS` 原始配置、`job.status` 原始英文
 * 枚举值），是本轮中文框架审查发现并清理的技术信息泄露。
 */

const PLATFORM_LABEL = OPERATOR_FACING_PLATFORMS.reduce((acc, p) => ({ ...acc, [p.key]: p.label }), {});

function getPlatformLabel(platform) {
  return PLATFORM_LABEL[platform] ?? platform ?? "未知平台";
}

const AUTH_STATUS_LABEL = {
  not_configured: "未授权",
  configured: "已授权",
  invalid: "授权异常",
  expired: "授权已过期",
};
const AUTH_STATUS_TONE = {
  not_configured: "neutral",
  configured: "success",
  invalid: "danger",
  expired: "warning",
};

const SYNC_STATUS_LABEL = { succeeded: "已完成", failed: "失败", pending: "进行中" };
const SYNC_STATUS_TONE = { succeeded: "success", failed: "danger", pending: "warning" };

function SyncHistoryList({ jobs }) {
  if (jobs.length === 0) return <EmptyState icon="⟲" message="尚未运行过同步" />;
  return (
    <DataTable
      columns={[
        { key: "startedAt", label: "时间" },
        { key: "status", label: "结果" },
        { key: "note", label: "说明" },
      ]}
      rows={jobs.map((job) => ({
        startedAt: new Date(job.startedAt).toLocaleString("zh-CN"),
        status: <StatusPill tone={SYNC_STATUS_TONE[job.status] ?? "neutral"}>{SYNC_STATUS_LABEL[job.status] ?? job.status}</StatusPill>,
        note: job.recordsProcessed === 0 ? "平台数据同步尚未接入真实后端" : `处理 ${job.recordsProcessed} 条记录`,
      }))}
    />
  );
}

export function StoreConnectionCenter() {
  const [shops, setShops] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busyStoreId, setBusyStoreId] = useState(null);
  const [historyStoreId, setHistoryStoreId] = useState(null);
  const [pausedStoreIds, setPausedStoreIds] = useState(() => new Set());
  const [, forceRerender] = useState(0);
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    getShops()
      .then((data) => {
        if (cancelled) return;
        setShops(data.items ?? []);
      })
      .catch((err) => !cancelled && setLoadError(err.message ?? "获取店铺列表失败"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleReauthorize(storeId, storeName) {
    showToast(`已为「${storeName}」发起重新授权流程（演示反馈，尚未连接真实平台授权页）`, "success");
  }

  function handleToggleSync(storeId, storeName) {
    setPausedStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(storeId)) {
        next.delete(storeId);
        showToast(`「${storeName}」已恢复同步`, "success");
      } else {
        next.add(storeId);
        showToast(`「${storeName}」已暂停同步`, "success");
      }
      return next;
    });
  }

  async function handleRunSync(storeId) {
    setBusyStoreId(storeId);
    try {
      const adapter = getAdapterForStore(storeId);
      await runSync(storeId, adapter, { syncType: "full" });
      showToast("同步已完成");
      forceRerender((n) => n + 1);
    } catch (err) {
      showToast(err.message ?? "同步失败", "danger");
    } finally {
      setBusyStoreId(null);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="平台连接" subtitle="管理店铺在各电商平台的授权与同步状态" actions={<DemoBadge />} />
        <EmptyState icon="⚠" message={`店铺列表加载失败：${loadError}（后端未启动？店铺列表来自真实店铺服务）`} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="平台连接" subtitle="管理店铺在淘宝/天猫/抖音电商/小红书/拼多多/京东等平台的授权与同步状态" actions={<DemoBadge />} />

      {shops === null ? (
        <EmptyState icon="⟲" message="正在加载店铺列表…" />
      ) : shops.length === 0 ? (
        <EmptyState icon="⌂" message="尚未创建任何店铺，请先前往「店铺管理」创建店铺档案" />
      ) : (
        <DataTable
          columns={[
            { key: "platform", label: "平台" },
            { key: "name", label: "店铺名称" },
            { key: "authStatus", label: "授权状态" },
            { key: "syncStatus", label: "同步状态" },
            { key: "actions", label: "操作" },
          ]}
          rows={shops.map((shop) => {
            const storeId = String(shop.id);
            const auth = toPlatformAuthorization(shop);
            const jobs = listSyncJobs(storeId);
            const paused = pausedStoreIds.has(storeId);
            const latestJob = jobs[0];
            return {
              platform: (
                <div>
                  <div>{getPlatformLabel(shop.platform)}</div>
                </div>
              ),
              name: (
                <div>
                  {shop.shop_name} <DemoBadge />
                </div>
              ),
              authStatus: <StatusPill tone={AUTH_STATUS_TONE[auth.credentialStatus] ?? "neutral"}>{AUTH_STATUS_LABEL[auth.credentialStatus] ?? "未知"}</StatusPill>,
              syncStatus: paused ? (
                <StatusPill tone="neutral">已暂停同步</StatusPill>
              ) : latestJob ? (
                <div>
                  <StatusPill tone={SYNC_STATUS_TONE[latestJob.status] ?? "neutral"}>{SYNC_STATUS_LABEL[latestJob.status] ?? latestJob.status}</StatusPill>
                  <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                    上次同步：{new Date(latestJob.startedAt).toLocaleString("zh-CN")}
                  </div>
                </div>
              ) : (
                <StatusPill tone="neutral">从未同步</StatusPill>
              ),
              actions: (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Button size="sm" variant="secondary" onClick={() => handleReauthorize(storeId, shop.shop_name)}>重新授权</Button>
                  <Button size="sm" variant="secondary" onClick={() => handleToggleSync(storeId, shop.shop_name)}>{paused ? "恢复同步" : "暂停同步"}</Button>
                  {!paused ? (
                    <Button size="sm" onClick={() => handleRunSync(storeId)} disabled={busyStoreId === storeId}>
                      {busyStoreId === storeId ? "同步中…" : "立即同步"}
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={() => setHistoryStoreId(storeId)}>同步记录</Button>
                </div>
              ),
            };
          })}
        />
      )}

      <Modal open={historyStoreId !== null} title="同步记录" onClose={() => setHistoryStoreId(null)}>
        {historyStoreId !== null ? <SyncHistoryList jobs={listSyncJobs(historyStoreId)} /> : null}
      </Modal>
    </div>
  );
}
