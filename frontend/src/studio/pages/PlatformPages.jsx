import {
  COMPUTE_TASK_PRIORITIES,
  COMPUTE_TASK_TYPES,
  getComputeOverview,
  getDistributedComputeState,
  isDistributedComputeEnabled,
} from "../../shared/distributedCompute/mockComputeRepository.js";
import { getStudioOverview, getStudioState } from "../mock/studioMock.js";
import { Card, DemoBadge, Pill, StatGrid, Table } from "./uiHelpers.jsx";
import { formatMoney, formatNumber } from "./formatters.js";

/* ---------------------------- 算力任务 ---------------------------- */

const TASK_TYPE_LABEL = Object.fromEntries(COMPUTE_TASK_TYPES.map((t) => [t.key, t.label]));
const TASK_PRIORITY_LABEL = Object.fromEntries(COMPUTE_TASK_PRIORITIES.map((p) => [p.key, p.label]));
const TASK_STATUS_LABEL = { queued: "排队中", assigned: "已分配", running: "运行中", completed: "已完成", failed: "失败", cancelled: "已取消" };
const TASK_STATUS_TONE = { queued: "neutral", assigned: "info", running: "info", completed: "success", failed: "danger", cancelled: "neutral" };

export function ComputeTasksPage() {
  const enabled = isDistributedComputeEnabled();
  const overview = getComputeOverview();
  const { devicePool, computeTasks } = getDistributedComputeState();

  return (
    <div>
      <div className="st-card" style={{ borderColor: "var(--warning)", background: "rgba(245,158,11,.06)" }}>
        <Pill tone="warning">架构预留</Pill>{" "}
        <span style={{ fontSize: 13 }}>
          当前为架构预留和模拟数据，尚未启用真实设备调度。distributedCompute.enabled = {String(enabled)}。
        </span>
      </div>

      <StatGrid
        items={[
          { label: "目标设备数量", value: devicePool.length },
          { label: "已分配设备数量", value: 0 },
          { label: "当前运行设备数量", value: 0 },
          { label: "预计 CPU 用量", value: `${overview.availableCpuCores} 核（可调度上限）` },
          { label: "预计内存用量", value: `${formatNumber(overview.availableMemoryMB)} MB（可调度上限）` },
          { label: "节省的云算力成本", value: formatMoney(overview.estimatedCloudCostSavedRmb) },
        ]}
      />

      <Card title="算力任务" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "taskId", label: "任务名称" },
            { key: "taskType", label: "任务类型", render: (r) => TASK_TYPE_LABEL[r.taskType] ?? r.taskType },
            { key: "source", label: "来源" },
            { key: "sourceProduct", label: "调度平台", render: () => "Operator Cloud（预留）" },
            { key: "priority", label: "优先级", render: (r) => TASK_PRIORITY_LABEL[r.priority] ?? r.priority },
            { key: "requiredCpu", label: "预计 CPU 用量", render: (r) => `${r.requiredCpu} 核` },
            { key: "requiredMemory", label: "预计内存用量", render: (r) => `${formatNumber(r.requiredMemory)} MB` },
            { key: "estimatedDuration", label: "预计运行时间", render: (r) => `${Math.round(r.estimatedDuration / 60)} 分钟` },
            { key: "status", label: "状态", render: (r) => <Pill tone={TASK_STATUS_TONE[r.status]}>{TASK_STATUS_LABEL[r.status]}</Pill> },
            { key: "progress", label: "完成进度", render: (r) => (r.status === "completed" ? "100%" : "0%") },
          ]}
          rows={computeTasks}
        />
      </Card>
    </div>
  );
}

/* ---------------------------- 数据分析 ---------------------------- */

export function DataAnalyticsPage() {
  const overview = getStudioOverview();
  const { contentProjects, matrixAccounts, adOrders } = getStudioState();

  const byContentType = contentProjects.reduce((acc, p) => {
    acc[p.contentType] = (acc[p.contentType] ?? 0) + 1;
    return acc;
  }, {});

  const byPlatform = matrixAccounts.reduce((acc, a) => {
    acc[a.platform] = (acc[a.platform] ?? 0) + a.totalPlays;
    return acc;
  }, {});

  return (
    <div>
      <StatGrid
        items={[
          { label: "本月广告收入", value: formatMoney(overview.monthlyAdRevenue) },
          { label: "内容分成收入", value: formatMoney(overview.contentShareRevenue) },
          { label: "总粉丝量", value: formatNumber(overview.totalFollowers) },
          { label: "本月累计流量", value: formatNumber(overview.monthlyTraffic) },
        ]}
      />
      <Card title="内容项目类型分布" action={<DemoBadge />}>
        <Table
          columns={[{ key: "type", label: "内容类型" }, { key: "count", label: "项目数量" }]}
          rows={Object.entries(byContentType).map(([type, count]) => ({ id: type, type, count }))}
        />
      </Card>
      <Card title="平台播放量分布" action={<DemoBadge />}>
        <Table
          columns={[{ key: "platform", label: "平台" }, { key: "plays", label: "累计播放量", render: (r) => formatNumber(r.plays) }]}
          rows={Object.entries(byPlatform).map(([platform, plays]) => ({ id: platform, platform, plays }))}
        />
      </Card>
      <Card title="广告订单结算概览" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "orderId", label: "订单编号" },
            { key: "customerName", label: "客户" },
            { key: "contractAmount", label: "合同金额", render: (r) => formatMoney(r.contractAmount) },
            { key: "collectedAmount", label: "已收金额", render: (r) => formatMoney(r.collectedAmount) },
          ]}
          rows={adOrders}
        />
      </Card>
    </div>
  );
}

/* ---------------------------- 设置 ---------------------------- */

export function SettingsPage() {
  return (
    <div>
      <Card title="产品信息">
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, fontSize: 13 }}>
          <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>产品名称</dt><dd style={{ margin: 0 }}>AI Commerce OS Studio</dd></div>
          <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>架构定位</dt><dd style={{ margin: 0 }}>Content Plane</dd></div>
          <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>数据状态</dt><dd style={{ margin: 0 }}>演示数据 · 不连接真实平台账号/广告交易系统</dd></div>
        </dl>
      </Card>
      <Card title="与其它产品端的关系">
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Founder 产生候选能力包 → Operator Cloud 审核、版本化、灰度和分发 → Studio 安装和使用 →
          运行摘要和成本数据返回 Cloud → Founder 根据经营结果继续优化。详见架构文档
          docs/01-reference-architecture/edition-architecture.md。
        </p>
      </Card>
      <Card title="快捷入口">
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          经营者工作台：/operator · 研发与经营验证中心：/founder · 平台控制台：/cloud
        </p>
      </Card>
    </div>
  );
}
