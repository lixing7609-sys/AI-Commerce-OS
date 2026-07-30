import { useState } from "react";
import {
  COMPUTE_TASK_PRIORITIES,
  COMPUTE_TASK_TYPES,
  getComputeOverview,
  getDistributedComputeState,
  isDistributedComputeEnabled,
} from "../../shared/distributedCompute/mockComputeRepository.js";
import { CONTENT_TYPE_LABEL, PROJECT_STATUS_LABEL, PROJECT_STATUS_TONE, getIpName, getStudioOverview, getStudioState } from "../mock/studioMock.js";
import { getGraphicContentState } from "../mock/graphicContentMock.js";
import { Card, DemoBadge, Field, Pill, StatGrid, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
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
  const { contentProjects, matrixAccounts, adOrders, matrixPublishTasks, contentAssets } = getStudioState();
  const { projects: graphicProjects, metrics: graphicMetrics } = getGraphicContentState();

  const byContentType = contentProjects.reduce((acc, p) => {
    acc[p.contentType] = (acc[p.contentType] ?? 0) + 1;
    return acc;
  }, {});

  const byPlatform = matrixAccounts.reduce((acc, a) => {
    if (!acc[a.platform]) acc[a.platform] = { plays: 0, followers: 0, accounts: 0 };
    acc[a.platform].plays += a.totalPlays;
    acc[a.platform].followers += a.followers;
    acc[a.platform].accounts += 1;
    return acc;
  }, {});

  const totalContentOutput = contentProjects.length + graphicProjects.length;
  const publishedCount = matrixPublishTasks.filter((t) => t.status === "published").length;
  const totalReads = graphicMetrics.reduce((sum, m) => sum + (m.reads ?? 0), 0);
  const totalEngagement = graphicMetrics.reduce((sum, m) => sum + (m.saves ?? 0) + (m.shares ?? 0) + (m.newFollowers ?? 0), 0);
  const totalConversions = graphicMetrics.reduce((sum, m) => sum + (m.productClicks ?? 0) + (m.conversions ?? 0), 0);
  const totalTokenUsed = contentProjects.reduce((sum, p) => sum + (p.tokenUsed ?? 0), 0) + graphicProjects.reduce((sum, p) => sum + (p.tokenUsed ?? 0), 0);
  const totalCost = contentAssets.reduce((sum, a) => sum + (a.tokenCost ?? 0), 0);
  const totalPlays = Object.values(byPlatform).reduce((sum, v) => sum + v.plays, 0);

  return (
    <div>
      <StatGrid
        items={[
          { label: "内容产量", value: totalContentOutput },
          { label: "发布数量", value: publishedCount },
          { label: "累计播放", value: formatNumber(totalPlays) },
          { label: "累计阅读", value: formatNumber(totalReads) },
          { label: "累计互动", value: formatNumber(totalEngagement) },
          { label: "累计转化", value: formatNumber(totalConversions) },
          { label: "本月广告收入", value: formatMoney(overview.monthlyAdRevenue) },
          { label: "内容分成收入", value: formatMoney(overview.contentShareRevenue) },
          { label: "内容生产成本（Token）", value: formatNumber(totalCost) },
          { label: "累计 Token 使用", value: formatNumber(totalTokenUsed) },
          { label: "总粉丝量", value: formatNumber(overview.totalFollowers) },
          { label: "本月累计流量", value: formatNumber(overview.monthlyTraffic) },
        ]}
      />
      <Card title="内容类型对比" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "type", label: "内容类型", render: (r) => CONTENT_TYPE_LABEL[r.type] ?? r.type },
            { key: "count", label: "项目数量" },
          ]}
          rows={Object.entries(byContentType).map(([type, count]) => ({ id: type, type, count }))}
        />
      </Card>
      <Card title="平台对比" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "platform", label: "平台" },
            { key: "accounts", label: "矩阵账号数", render: (r) => r.accounts },
            { key: "followers", label: "粉丝量", render: (r) => formatNumber(r.followers) },
            { key: "plays", label: "累计播放量", render: (r) => formatNumber(r.plays) },
          ]}
          rows={Object.entries(byPlatform).map(([platform, v]) => ({ id: platform, platform, ...v }))}
        />
      </Card>
      <Card title="项目复盘" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "name", label: "内容项目" },
            { key: "contentType", label: "内容类型", render: (r) => CONTENT_TYPE_LABEL[r.contentType] ?? r.contentType },
            { key: "ip", label: "所属 IP", render: (r) => getIpName(r.ipId) },
            { key: "status", label: "状态", render: (r) => <Pill tone={PROJECT_STATUS_TONE[r.status]}>{PROJECT_STATUS_LABEL[r.status]}</Pill> },
            { key: "budget", label: "预算", render: (r) => formatMoney(r.budget) },
            { key: "tokenUsed", label: "已用 Token", render: (r) => r.tokenUsed.toLocaleString() },
            { key: "budgetUsage", label: "预算使用率", render: (r) => (r.budget ? `${Math.round((r.tokenUsed / r.budget) * 100)}%` : "—") },
          ]}
          rows={contentProjects}
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

/* ---------------------------- Studio设置 ---------------------------- */

export function StudioSettingsPage() {
  return (
    <div>
      <Card title="产品信息">
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, fontSize: 13 }}>
          <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>产品名称</dt><dd style={{ margin: 0 }}>AI Commerce OS Studio</dd></div>
          <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>产品定位</dt><dd style={{ margin: 0 }}>AI Content Company Operating System · AI内容公司操作系统</dd></div>
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

/* ---------------------------- 平台连接 ---------------------------- */

const PLATFORM_CONNECTIONS_SEED = [
  { id: "pc-1", platform: "抖音", accountHandle: "@重生豪门官方", status: "已连接", lastSync: "3分钟前" },
  { id: "pc-2", platform: "小红书", accountHandle: "星辰家居研究所", status: "已连接", lastSync: "12分钟前" },
  { id: "pc-3", platform: "红果短剧", accountHandle: "重生豪门剧场", status: "已连接", lastSync: "1小时前" },
  { id: "pc-4", platform: "视频号", accountHandle: "AI一人公司观察", status: "已连接", lastSync: "5分钟前" },
  { id: "pc-5", platform: "微信公众号", accountHandle: "AI一人公司观察", status: "未连接", lastSync: "—" },
  { id: "pc-6", platform: "知乎", accountHandle: "—", status: "未连接", lastSync: "—" },
];

export function PlatformConnectionsPage() {
  const [rows, setRows] = useState(PLATFORM_CONNECTIONS_SEED);
  const [feedback, showFeedback] = useInlineFeedback();

  function toggle(id) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, status: r.status === "已连接" ? "未连接" : "已连接", lastSync: r.status === "已连接" ? "—" : "刚刚" } : r)));
    showFeedback("平台账号连接状态已更新（演示，未发起真实授权）");
  }

  return (
    <Card title="平台连接" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Table
        columns={[
          { key: "platform", label: "平台" }, { key: "accountHandle", label: "账号" },
          { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "已连接" ? "success" : "neutral"}>{r.status}</Pill> },
          { key: "lastSync", label: "最近同步" },
          { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>{r.status === "已连接" ? "断开连接" : "连接账号"}</button> },
        ]}
        rows={rows}
      />
    </Card>
  );
}

/* ---------------------------- 品牌规范 ---------------------------- */

export function BrandGuidelinesPage() {
  const [form, setForm] = useState({
    toneOfVoice: "专业、克制、带一点鼓舞人心的表达", forbiddenWords: "保证、绝对、最、第一（无依据的极限用语）",
    visualStyle: "冷色调为主，简洁排版，避免过度娱乐化元素", logoUsage: "Logo 需保留四周留白，不得拉伸变形",
    complianceNote: "涉及品牌植入内容需在发布前经品牌方复核",
  });
  const [feedback, showFeedback] = useInlineFeedback();

  function set(key, value) { setForm((f) => ({ ...f, [key]: value })); }

  return (
    <Card title="品牌规范" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Field label="语气与风格"><textarea value={form.toneOfVoice} onChange={(e) => set("toneOfVoice", e.target.value)} /></Field>
      <Field label="禁用词"><textarea value={form.forbiddenWords} onChange={(e) => set("forbiddenWords", e.target.value)} /></Field>
      <Field label="视觉风格"><textarea value={form.visualStyle} onChange={(e) => set("visualStyle", e.target.value)} /></Field>
      <Field label="Logo 使用规范"><textarea value={form.logoUsage} onChange={(e) => set("logoUsage", e.target.value)} /></Field>
      <Field label="合规提示"><textarea value={form.complianceNote} onChange={(e) => set("complianceNote", e.target.value)} /></Field>
      <button type="button" className="st-btn st-btn--primary" onClick={() => showFeedback("品牌规范已保存，将同步给内容审核 Agent")}>保存</button>
    </Card>
  );
}

/* ---------------------------- 通知与权限 ---------------------------- */

const NOTIFICATION_ITEMS = [
  { key: "reviewPending", label: "内容待审核提醒" }, { key: "accountAtRisk", label: "矩阵账号异常提醒" },
  { key: "publishFailed", label: "发布失败提醒" }, { key: "budgetThreshold", label: "预算超限提醒" },
  { key: "settlementDue", label: "结算到账提醒" },
];

const PERMISSION_ROLES = [
  { role: "Studio负责人", scope: "全部模块", canEdit: true },
  { role: "内容运营总监", scope: "内容策划 / AI创作中心 / 矩阵运营", canEdit: true },
  { role: "AI导演", scope: "AI创作中心 / AI导演工作台", canEdit: true },
  { role: "编剧", scope: "剧本 / 脚本 / 分镜", canEdit: true },
  { role: "剪辑与发布人员", scope: "AI剪辑 / 矩阵发布", canEdit: true },
  { role: "商业化运营人员", scope: "商业经营", canEdit: false },
];

export function NotificationsPermissionsPage() {
  const [notifications, setNotifications] = useState(() => Object.fromEntries(NOTIFICATION_ITEMS.map((n) => [n.key, true])));
  const [feedback, showFeedback] = useInlineFeedback();

  function toggleNotification(key) {
    setNotifications((n) => ({ ...n, [key]: !n[key] }));
    showFeedback("通知设置已更新");
  }

  return (
    <div>
      <Card title="通知设置" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
        {NOTIFICATION_ITEMS.map((item) => (
          <label key={item.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
            <input type="checkbox" checked={notifications[item.key]} onChange={() => toggleNotification(item.key)} />
            {item.label}
          </label>
        ))}
      </Card>
      <Card title="角色权限">
        <Table
          columns={[
            { key: "role", label: "角色" }, { key: "scope", label: "可见范围" },
            { key: "canEdit", label: "可编辑", render: (r) => <Pill tone={r.canEdit ? "success" : "neutral"}>{r.canEdit ? "是" : "仅查看"}</Pill> },
          ]}
          rows={PERMISSION_ROLES.map((r, idx) => ({ id: idx, ...r }))}
        />
      </Card>
    </div>
  );
}
