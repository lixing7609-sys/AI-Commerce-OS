import { useEffect, useState } from "react";
import { PageHeader } from "../kit/PageHeader.jsx";
import { DataTable } from "../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../kit/StatusPill.jsx";
import { Button } from "../kit/Button.jsx";
import { EmptyState } from "../kit/EmptyState.jsx";
import { Modal } from "../kit/Modal.jsx";
import { useToast } from "../kit/useToast.js";
import { getShops } from "../../services/shopApi.js";
import { AccessMode } from "../../shared/storePlatform/types.js";
import { toPlatformAuthorization, hasConfiguredCredentials } from "../../shared/storePlatform/credentialStore.js";
import {
  getAccessMode,
  setAccessMode,
  getAutomationRiskLevel,
  setAutomationRiskLevel,
  getAdapterForStore,
  initializeAccessModeForNewStore,
  listSyncJobs,
} from "../../shared/storePlatform/storeConnectionRepository.js";
import { runSync } from "../../shared/storePlatform/syncService.js";
import { mockAdapter, MOCK_STORE_ID } from "../../shared/storePlatform/mockAdapter.js";
import { FEATURE_FLAGS } from "../../shared/storePlatform/featureFlags.js";

/**
 * P1「店铺接入中心」——第一家真实店铺分层接入的落地页面（任务书
 * §6/§14/§18）。这里刻意不重复店铺中心已有的「链接与授权」/
 * 「平台连接器」标签页（凭据 CRUD、OAuth、能力矩阵原型已经在那里
 * 完整存在，见 modules/storeCenter/PlatformConnectorTab.jsx）——本
 * 页面新增、且只负责这一层已有页面都没有的东西：
 *   1. 接入模式分层（MODE_MOCK/SANDBOX/LIVE_READONLY/LIVE_APPROVAL/
 *      LIVE_AUTOMATED），新接入店铺恒定默认 MODE_LIVE_READONLY；
 *   2. 自动化风险等级（L0-L4），默认恒定 L1；
 *   3. 触发一次真实的 StorePlatformAdapter 同步任务并如实展示结果
 *      （真实店铺目前诚实报告"平台数据同步尚未接入"，不是假装成功）。
 *
 * 凭据本身的配置/OAuth 授权仍然只能去「店铺中心」完成——本页面对
 * 每个店铺提供一个跳转入口，不重新实现一遍凭据表单。
 */

const ACCESS_MODE_LABEL = {
  [AccessMode.MOCK]: "MODE_MOCK · 纯演示数据",
  [AccessMode.SANDBOX]: "MODE_SANDBOX · 平台沙箱",
  [AccessMode.LIVE_READONLY]: "MODE_LIVE_READONLY · 真实只读（默认）",
  [AccessMode.LIVE_APPROVAL]: "MODE_LIVE_APPROVAL · 真实写入需审批",
};

const SELECTABLE_MODES = [AccessMode.MOCK, AccessMode.SANDBOX, AccessMode.LIVE_READONLY, AccessMode.LIVE_APPROVAL];

const RISK_LEVELS = ["L0", "L1", "L2", "L3", "L4"];

function CredentialBadge({ auth }) {
  if (!auth) return <StatusPill tone="neutral">未知</StatusPill>;
  const map = {
    not_configured: { tone: "neutral", label: "未配置" },
    configured: { tone: "success", label: "已配置" },
    invalid: { tone: "danger", label: "无效" },
    expired: { tone: "warning", label: "已过期" },
  };
  const entry = map[auth.credentialStatus] ?? map.not_configured;
  return <StatusPill tone={entry.tone}>{entry.label}</StatusPill>;
}

function SyncJobList({ jobs }) {
  if (jobs.length === 0) return <EmptyState icon="⟲" message="尚未运行过同步任务" />;
  return (
    <DataTable
      columns={[
        { key: "startedAt", label: "开始时间" },
        { key: "syncType", label: "类型" },
        { key: "status", label: "状态" },
        { key: "recordsProcessed", label: "处理记录数" },
        { key: "recordsFailed", label: "失败数" },
        { key: "note", label: "说明" },
      ]}
      rows={jobs.map((job) => ({
        startedAt: new Date(job.startedAt).toLocaleString("zh-CN"),
        syncType: job.syncType === "full" ? "全量" : "增量",
        status: <StatusPill tone={job.status === "succeeded" ? "success" : job.status === "failed" ? "danger" : "warning"}>{job.status}</StatusPill>,
        recordsProcessed: job.recordsProcessed,
        recordsFailed: job.recordsFailed,
        note: job.errors[0]?.message ?? (job.recordsProcessed === 0 ? "平台数据同步尚未接入真实后端" : "—"),
      }))}
    />
  );
}

export function StoreConnectionCenter() {
  const [shops, setShops] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [busyStoreId, setBusyStoreId] = useState(null);
  const [historyStoreId, setHistoryStoreId] = useState(null);
  const [, forceRerender] = useState(0);
  const showToast = useToast();

  useEffect(() => {
    let cancelled = false;
    getShops()
      .then((data) => {
        if (cancelled) return;
        const items = data.items ?? [];
        items.forEach((shop) => initializeAccessModeForNewStore(String(shop.id)));
        setShops(items);
      })
      .catch((err) => !cancelled && setLoadError(err.message ?? "获取店铺列表失败"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleModeChange(storeId, mode) {
    try {
      setAccessMode(storeId, mode);
      forceRerender((n) => n + 1);
      showToast(`已切换为 ${ACCESS_MODE_LABEL[mode]}`);
    } catch (err) {
      showToast(err.message ?? "切换失败", "danger");
    }
  }

  function handleRiskChange(storeId, level) {
    const result = setAutomationRiskLevel(storeId, level);
    forceRerender((n) => n + 1);
    if (result.requiresExtraConfirmation) {
      showToast(`${level} 属于较高风险等级，仍需人工在自动化策略中显式确认才会生效`);
    }
  }

  async function handleRunSync(storeId) {
    setBusyStoreId(storeId);
    try {
      const adapter = getAdapterForStore(storeId);
      const job = await runSync(storeId, adapter, { syncType: "full" });
      showToast(
        job.status === "succeeded" && job.recordsProcessed > 0
          ? `同步完成：处理 ${job.recordsProcessed} 条记录`
          : `同步完成：${job.recordsProcessed} 条记录（${getAccessMode(storeId) === AccessMode.LIVE_READONLY ? "真实平台数据同步尚未接入，如实返回 0 条" : "详见运行记录"}）`
      );
      forceRerender((n) => n + 1);
    } catch (err) {
      showToast(err.message ?? "同步失败", "danger");
    } finally {
      setBusyStoreId(null);
    }
  }

  async function handleRunMockDrill() {
    setBusyStoreId(MOCK_STORE_ID);
    try {
      const job = await runSync(MOCK_STORE_ID, mockAdapter, { syncType: "full" });
      showToast(`MODE_MOCK 演练完成：处理 ${job.recordsProcessed} 条演示记录`);
      forceRerender((n) => n + 1);
    } finally {
      setBusyStoreId(null);
    }
  }

  if (loadError) {
    return (
      <div>
        <PageHeader title="真实店铺接入" subtitle="第一家真实店铺分层接入" />
        <EmptyState icon="⚠" message={`店铺列表加载失败：${loadError}（后端未启动？店铺列表来自真实店铺服务）`} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="真实店铺接入"
        subtitle="MODE_MOCK → MODE_SANDBOX → MODE_LIVE_READONLY → MODE_LIVE_APPROVAL → MODE_LIVE_AUTOMATED（本阶段禁止默认开启）"
        actions={<Button variant="secondary" onClick={handleRunMockDrill} disabled={busyStoreId === MOCK_STORE_ID}>运行 Mock 演练</Button>}
      />

      <div className="fdr-card" style={{ marginBottom: 16, fontSize: 13 }}>
        <strong>MODE_LIVE_AUTOMATED：</strong>
        {FEATURE_FLAGS.storePlatform.liveAutomatedEnabled ? "已启用" : "本阶段全局禁用，不对任何店铺开放"} ·
        新接入店铺默认接入模式：<code>{FEATURE_FLAGS.storePlatform.defaultAccessModeForNewStore}</code> ·
        默认自动化风险等级：<code>{FEATURE_FLAGS.storePlatform.defaultAutomationRiskLevel}</code>
      </div>

      {shops === null ? (
        <EmptyState icon="⟲" message="正在加载店铺列表…" />
      ) : shops.length === 0 ? (
        <EmptyState icon="⌂" message="尚未创建任何店铺，请先前往「店铺中心」创建店铺档案" />
      ) : (
        <DataTable
          columns={[
            { key: "name", label: "店铺" },
            { key: "credential", label: "凭据状态" },
            { key: "mode", label: "接入模式" },
            { key: "risk", label: "自动化风险等级" },
            { key: "lastSync", label: "上次同步" },
            { key: "actions", label: "操作" },
          ]}
          rows={shops.map((shop) => {
            const storeId = String(shop.id);
            const auth = toPlatformAuthorization(shop);
            const mode = getAccessMode(storeId);
            const risk = getAutomationRiskLevel(storeId);
            const jobs = listSyncJobs(storeId);
            return {
              name: (
                <div>
                  <div>{shop.shop_name} <DemoBadge /></div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{shop.platform}</div>
                </div>
              ),
              credential: (
                <div>
                  <CredentialBadge auth={auth} />
                  {auth.missingRequirements.length > 0 ? (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                      {auth.missingRequirements[0]}
                    </div>
                  ) : null}
                </div>
              ),
              mode: (
                <select
                  className="fdr-select"
                  value={mode}
                  onChange={(e) => handleModeChange(storeId, e.target.value)}
                >
                  {SELECTABLE_MODES.map((m) => (
                    <option key={m} value={m} disabled={m !== AccessMode.MOCK && m !== AccessMode.LIVE_READONLY && !hasConfiguredCredentials(auth)}>
                      {ACCESS_MODE_LABEL[m]}
                    </option>
                  ))}
                </select>
              ),
              risk: (
                <select className="fdr-select" value={risk} onChange={(e) => handleRiskChange(storeId, e.target.value)}>
                  {RISK_LEVELS.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              ),
              lastSync: jobs[0] ? new Date(jobs[0].startedAt).toLocaleString("zh-CN") : "从未同步",
              actions: (
                <div style={{ display: "flex", gap: 8 }}>
                  <Button size="sm" onClick={() => handleRunSync(storeId)} disabled={busyStoreId === storeId}>
                    {busyStoreId === storeId ? "同步中…" : "运行只读同步"}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setHistoryStoreId(storeId)}>同步记录</Button>
                </div>
              ),
            };
          })}
        />
      )}

      <Modal open={historyStoreId !== null} title="同步运行记录" onClose={() => setHistoryStoreId(null)}>
        {historyStoreId !== null ? <SyncJobList jobs={listSyncJobs(historyStoreId)} /> : null}
      </Modal>
    </div>
  );
}
