import { useMemo, useState } from "react";
import { PageHeader, StatCard, StatGrid, DataTable, StatusPill, SearchField, FilterBar, Button, Drawer, DemoBadge } from "../../kit/index.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getSystemLogs, LOG_CATEGORIES } from "../../mock/systemCenterMock.js";
import { getDevice, getOperator } from "../../../demoData/cloudDemoData.js";

const LEVELS = ["all", "info", "warning", "error"];
const LEVEL_LABEL = { all: "全部级别", info: "信息", warning: "警告", error: "错误" };
const LEVEL_TONE = { info: "neutral", warning: "warning", error: "danger" };
const CATEGORY_LABEL = Object.fromEntries(LOG_CATEGORIES.map((c) => [c.key, c.label]));

function LogDetailDrawer({ log, onClose, onJumpToDevice }) {
  if (!log) return null;
  const device = log.deviceId ? getDevice(log.deviceId) : null;
  const operator = log.operatorId ? getOperator(log.operatorId) : null;

  return (
    <Drawer
      open={!!log}
      title="日志详情"
      onClose={onClose}
      footer={
        device ? (
          <Button variant="primary" onClick={() => onJumpToDevice(log.operatorId)}>跳转到设备管理 → {device.id}</Button>
        ) : (
          <Button variant="ghost" onClick={onClose}>关闭</Button>
        )
      }
    >
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <StatusPill tone={LEVEL_TONE[log.level]}>{LEVEL_LABEL[log.level]}</StatusPill>
        <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{CATEGORY_LABEL[log.category] ?? log.category} · {log.source}</span>
      </div>
      <p style={{ fontSize: 13, lineHeight: 1.6 }}>{log.message}</p>
      <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 12 }}>
        <h4 style={{ fontSize: 13, margin: "0 0 8px 0" }}>关联事件</h4>
        {device || operator ? (
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, fontSize: 13, margin: 0 }}>
            <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>关联设备</dt><dd style={{ margin: 0 }}>{device?.id ?? "—"}</dd></div>
            <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>设备型号</dt><dd style={{ margin: 0 }}>{device?.model ?? "—"}</dd></div>
            <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>当前版本</dt><dd style={{ margin: 0 }}>{device?.systemVersion ?? "—"}</dd></div>
            <div><dt style={{ color: "var(--text-secondary)", fontSize: 11 }}>关联 Operator</dt><dd style={{ margin: 0 }}>{operator?.name ?? "—"}</dd></div>
          </dl>
        ) : (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>该事件不关联具体设备（平台级系统日志）。</p>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 12 }}>
        时间：{new Date(log.ts).toLocaleString("zh-CN")} · 日志编号：{log.id}
      </p>
    </Drawer>
  );
}

/**
 * Cloud Center · Logs (Charter §3.5) — 日志中心。产品需求原文要求的
 * 8 个日志分类（系统/设备/OTA/Token/许可证/安全/操作/错误）、搜索、
 * 筛选、详情、关联事件跳转在此实现——之前的版本只有一个级别下拉和
 * 一张表，是本组里明确要重建的页面。
 *
 * "关联事件"点击一条日志能看到这是哪台设备/哪个 Operator 的事件，
 * 并提供跳转到设备管理对应设备的入口（demoData/cloudDemoData.js 的
 * getDevice/getOperator，与设备管理/OTA更新/许可证/Token中心/系统
 * 监控共用同一批设备/Operator id，不是另起一套不相关的编号）。
 */
export function LogsModule() {
  const { navigate } = useConsoleNavContext();
  const [level, setLevel] = useState("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  const allLogs = useMemo(() => getSystemLogs(), []);

  const logs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLogs
      .filter((l) => level === "all" || l.level === level)
      .filter((l) => category === "all" || l.category === category)
      .filter((l) => !q || l.message.toLowerCase().includes(q) || l.source.toLowerCase().includes(q) || (l.deviceId ?? "").toLowerCase().includes(q))
      .sort((a, b) => new Date(b.ts) - new Date(a.ts));
  }, [allLogs, level, category, query]);

  const stats = useMemo(() => ({
    total: allLogs.length,
    error: allLogs.filter((l) => l.level === "error").length,
    warning: allLogs.filter((l) => l.level === "warning").length,
    info: allLogs.filter((l) => l.level === "info").length,
  }), [allLogs]);

  function handleJumpToDevice(operatorId) {
    setSelectedLog(null);
    navigate("cloudCenter", { subView: "devices", entityId: operatorId ?? undefined });
  }

  return (
    <div>
      <PageHeader title="日志中心" subtitle="跨模块日志统一检索——系统/设备/OTA/Token/许可证/安全/操作/错误日志，支持关联事件跳转" actions={<DemoBadge />} />

      <StatGrid>
        <StatCard label="日志总数" value={stats.total} />
        <StatCard label="错误日志" value={stats.error} onClick={() => { setLevel("error"); setCategory("all"); }} />
        <StatCard label="警告日志" value={stats.warning} onClick={() => { setLevel("warning"); setCategory("all"); }} />
        <StatCard label="信息日志" value={stats.info} onClick={() => { setLevel("info"); setCategory("all"); }} />
      </StatGrid>

      <div className="fdr-card">
        <FilterBar
          activeFilters={[
            ...(level !== "all" ? [{ key: "level", label: LEVEL_LABEL[level], onRemove: () => setLevel("all") }] : []),
            ...(category !== "all" ? [{ key: "category", label: CATEGORY_LABEL[category], onRemove: () => setCategory("all") }] : []),
          ]}
          onClearAll={() => { setLevel("all"); setCategory("all"); setQuery(""); }}
        >
          <SearchField value={query} onChange={setQuery} placeholder="搜索日志内容 / 来源 / 设备编号" />
          <select className="fdr-select" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">全部分类</option>
            {LOG_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select className="fdr-select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
          </select>
        </FilterBar>

        <DataTable
          columns={[
            { key: "ts", label: "时间", render: (r) => new Date(r.ts).toLocaleString("zh-CN") },
            { key: "level", label: "级别", render: (r) => <StatusPill tone={LEVEL_TONE[r.level]}>{LEVEL_LABEL[r.level]}</StatusPill> },
            { key: "category", label: "分类", render: (r) => CATEGORY_LABEL[r.category] ?? r.category },
            { key: "source", label: "来源" },
            { key: "message", label: "内容" },
            { key: "deviceId", label: "关联设备", render: (r) => r.deviceId ?? "—" },
            {
              key: "actions", label: "详情", render: (r) => (
                <Button size="sm" variant="ghost" onClick={() => setSelectedLog(r)}>查看详情</Button>
              ),
            },
          ]}
          rows={logs}
          onRowClick={(row) => setSelectedLog(row)}
          emptyMessage="没有符合当前筛选条件的日志"
        />
      </div>

      <LogDetailDrawer log={selectedLog} onClose={() => setSelectedLog(null)} onJumpToDevice={handleJumpToDevice} />
    </div>
  );
}
