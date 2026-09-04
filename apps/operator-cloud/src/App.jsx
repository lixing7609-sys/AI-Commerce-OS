import { AppShell, SinoFUTWidget, SinoWorkspace, StatCard, PlaceholderCard, useApiState, useSinoFullScreen } from "@sinofut/ui";
import { api, SINO_PERSONAS } from "@sinofut/domain";

const CROSS_APP_LINKS = [
  { label: "Founder", href: "http://localhost:5180" },
  { label: "Operator", href: "http://localhost:5181" },
  { label: "Studio", href: "http://localhost:5182" },
];

const DEVICE_COLUMNS = [
  { key: "id", label: "编号" },
  { key: "name", label: "设备名称" },
  { key: "owner", label: "所有者" },
  { key: "version", label: "版本" },
  { key: "aiQuota", label: "AI额度" },
  { key: "status", label: "在线状态" },
  { key: "lastSeenAt", label: "最近在线" },
  { key: "os", label: "操作系统" },
  { key: "hardware", label: "硬件配置" },
  { key: "license", label: "许可证" },
  { key: "updatedAt", label: "更新时间" },
];

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const { state, refresh } = useApiState();
  const { isFullScreenOpen, openFullScreen, closeFullScreen } = useSinoFullScreen();

  if (isFullScreenOpen) {
    return <SinoWorkspace persona={SINO_PERSONAS.cloud} variant="overlay" onExit={closeFullScreen} />;
  }

  if (!state) {
    return (
      <AppShell appLabel="Operator Cloud" crossAppLinks={CROSS_APP_LINKS} onOpenFullScreen={openFullScreen}>
        <p>加载中…</p>
      </AppShell>
    );
  }

  const { cloud } = state;
  const usedPct = (cloud.aiQuota.used / cloud.aiQuota.total) * 100;
  const isWarning = usedPct / 100 >= cloud.aiQuota.warnAt;

  const simulateUsage = async () => {
    await api.tickCloudUsage(3000);
    refresh();
  };

  return (
    <AppShell appLabel="Operator Cloud" crossAppLinks={CROSS_APP_LINKS} onOpenFullScreen={openFullScreen}>
      <div className="sf-page-header">
        <h1>Operator Cloud</h1>
        <p>
          Operator 部署实例的设备/版本/许可证/AI 经营额度/远程运维管控层。
          不展示 Operator 的订单/客户/聊天/利润明细（见 03-information-architecture.md §2.8）。
        </p>
      </div>

      <div className="sf-grid sf-grid-3" style={{ marginBottom: "var(--space-3)" }}>
        <StatCard label="在线设备" value={`${cloud.devices.filter((d) => d.status === "online").length} / ${cloud.devices.length}`} />
        <StatCard
          label="AI 经营额度使用率"
          value={`${usedPct.toFixed(1)}%`}
          hint={`${cloud.aiQuota.used.toLocaleString("zh-CN")} / ${cloud.aiQuota.total.toLocaleString("zh-CN")}（周期 ${cloud.aiQuota.cycle}）`}
        />
        <StatCard label="许可证状态" value={cloud.license.status === "active" ? "有效" : "已过期"} hint={cloud.license.type} />
      </div>

      <div className="sf-card" style={{ marginBottom: "var(--space-3)", overflowX: "auto" }}>
        <h3>设备清单</h3>
        <table className="sf-cloud-device-table">
          <thead>
            <tr>
              {DEVICE_COLUMNS.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cloud.devices.map((d) => (
              <tr key={d.id}>
                <td>{d.id}</td>
                <td>{d.name}</td>
                <td>{d.owner}</td>
                <td>{d.version}</td>
                <td>{d.aiQuota}</td>
                <td>
                  <span className={`sf-badge ${d.status === "online" ? "success" : "danger"}`}>{d.status}</span>
                </td>
                <td>{fmtDateTime(d.lastSeenAt)}</td>
                <td>{d.os}</td>
                <td>{d.hardware}</td>
                <td>{d.license}</td>
                <td>{fmtDateTime(d.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>人工智能经营额度</h3>
          <div style={{ background: "var(--surface-sunken)", borderRadius: 8, height: 12, overflow: "hidden", marginBottom: 8 }}>
            <div
              style={{
                width: `${Math.min(100, usedPct)}%`,
                height: "100%",
                background: isWarning ? "var(--signal-warning)" : "var(--ai-accent)",
              }}
            />
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {isWarning ? "额度接近告警阈值，建议关注下一计费周期升级" : "额度使用正常"}
          </p>
          <button type="button" className="sf-icon-button" onClick={simulateUsage}>
            模拟一次 Agent/Workflow 调用消耗
          </button>
        </div>

        <div className="sf-card">
          <h3>版本与升级</h3>
          <p>当前系统版本：2608·V2</p>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>暂无待升级设备</p>
        </div>

        <div className="sf-card">
          <h3>故障与远程运维工单</h3>
          {cloud.faults.length === 0 ? (
            <p style={{ color: "var(--text-tertiary)" }}>暂无故障工单</p>
          ) : (
            cloud.faults.map((f) => <div key={f.id} className="sf-opportunity-item">{f.description}</div>)
          )}
        </div>

        <PlaceholderCard
          mission="展示脱敏运行指标（QPS/延迟/错误率），不暴露 Operator 经营数据"
          coreObjects={["Device"]}
          upstream="设备运行时监控"
          downstream="远程运维工单"
          sinoActions={["异常指标自动开工单"]}
          status="待建模：监控数据接入"
          loopRelation="Operator Cloud 独立于经营闭环，仅服务部署层"
          nextSteps={["接入真实监控数据源（脱敏）"]}
        />
      </div>

      <SinoFUTWidget onOpen={openFullScreen} />
    </AppShell>
  );
}
