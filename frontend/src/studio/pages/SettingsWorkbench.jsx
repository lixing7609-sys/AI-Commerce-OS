import { useState } from "react";
import { Card, DemoBadge, Field, Pill, Table, Tabs } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { StudioSettingsPage, PlatformConnectionsPage, NotificationsPermissionsPage } from "./PlatformPages.jsx";

const TABS = [
  { key: "settings", label: "设置" },
  { key: "connections", label: "平台连接" },
  { key: "accountPermissions", label: "矩阵账号权限" },
  { key: "rules", label: "内容与发布规则" },
  { key: "assetPermissions", label: "素材权限" },
  { key: "notifications", label: "通知与权限" },
  { key: "costLimits", label: "成本限制" },
  { key: "generation", label: "生成偏好" },
];

const ACCOUNT_PERMISSION_SEED = [
  { id: 1, role: "Studio负责人", accountScope: "全部矩阵账号", canPublish: true, canEditProfile: true },
  { id: 2, role: "内容运营总监", accountScope: "全部矩阵账号", canPublish: true, canEditProfile: false },
  { id: 3, role: "AI导演", accountScope: "所负责 IP 关联账号", canPublish: false, canEditProfile: false },
  { id: 4, role: "剪辑与发布人员", accountScope: "指定矩阵账号", canPublish: true, canEditProfile: false },
];

const RULE_SEED = {
  reviewRules: "涉及品牌植入、招商话术、医疗健康类内容必须人工复核；其余内容通过 AI 审核 + 抽检。",
  forbiddenTerms: "保证、绝对、最、第一、根治、无效退款（无依据的极限或医疗用语）",
  publishRules: "同一 IP 24 小时内跨账号发布间隔不少于 30 分钟；矩阵账号发布前需通过内容审核。",
  publishWindow: "工作日 09:00-23:00，节假日 10:00-24:00",
  brandRules: "品牌相关内容需符合品牌规范手册（Logo/色彩/语气），涉及品牌合作需品牌方复核。",
};

const ASSET_PERMISSION_SEED = [
  { id: 1, role: "Studio负责人", scope: "全部素材（含商品素材/项目素材）", canDownload: true, canDelete: true },
  { id: 2, role: "内容运营总监", scope: "全部素材", canDownload: true, canDelete: false },
  { id: 3, role: "AI导演", scope: "所负责项目素材", canDownload: true, canDelete: false },
  { id: 4, role: "外部合作方", scope: "仅授权对外的素材", canDownload: false, canDelete: false },
];

const COST_LIMIT_SEED = [
  { id: "shortdrama", label: "AI 短剧单项目预算上限", value: 60000 },
  { id: "video", label: "AI 视频单任务预算上限", value: 15000 },
  { id: "graphic", label: "AI 图文单项目预算上限", value: 8000 },
  { id: "monthly", label: "Studio 月度总预算上限", value: 300000 },
];

const GENERATION_PREFS_SEED = {
  defaultVideoModel: "Video-Gen v3", defaultImageStyle: "写实 · 冷色调", defaultVoice: "沉稳青年音",
  autoSubtitle: true, autoBgm: true, preferHumanReviewOnRisk: true,
};

/**
 * Studio Lab · Settings (Charter §3.4)——平台连接 / 矩阵账号权限 /
 * 内容审核规则 / 发布规则 / 品牌规则 / 素材权限 / 通知设置 / 成本限制 /
 * 生成偏好。Platform Connections 是 Studio 自己的 AI 生产连接器（与
 * Operator 面向经营的平台连接、Cloud 的基础设施连接器不同，见
 * PlatformConnectionsPage 注释）。
 */
export function SettingsWorkbench() {
  const [tab, setTab] = useState("settings");
  const [feedback, showFeedback] = useInlineFeedback();
  const [rules, setRules] = useState(RULE_SEED);
  const [costLimits, setCostLimits] = useState(COST_LIMIT_SEED);
  const [prefs, setPrefs] = useState(GENERATION_PREFS_SEED);

  function setRule(key, value) { setRules((r) => ({ ...r, [key]: value })); }
  function setCostLimit(id, value) { setCostLimits((cs) => cs.map((c) => (c.id === id ? { ...c, value: Number(value) } : c))); }
  function setPref(key, value) { setPrefs((p) => ({ ...p, [key]: value })); }

  return (
    <div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "settings" ? <StudioSettingsPage /> : null}
      {tab === "connections" ? <PlatformConnectionsPage /> : null}

      {tab === "accountPermissions" ? (
        <Card title="矩阵账号权限" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
          <Table
            columns={[
              { key: "role", label: "角色" }, { key: "accountScope", label: "可管理账号范围" },
              { key: "canPublish", label: "可发布", render: (r) => <Pill tone={r.canPublish ? "success" : "neutral"}>{r.canPublish ? "是" : "否"}</Pill> },
              { key: "canEditProfile", label: "可编辑账号资料", render: (r) => <Pill tone={r.canEditProfile ? "success" : "neutral"}>{r.canEditProfile ? "是" : "否"}</Pill> },
            ]}
            rows={ACCOUNT_PERMISSION_SEED}
          />
        </Card>
      ) : null}

      {tab === "rules" ? (
        <div>
          <Card title="内容审核规则" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
            <Field label="审核规则说明"><textarea value={rules.reviewRules} onChange={(e) => setRule("reviewRules", e.target.value)} /></Field>
            <Field label="禁用词"><textarea value={rules.forbiddenTerms} onChange={(e) => setRule("forbiddenTerms", e.target.value)} /></Field>
          </Card>
          <Card title="发布规则">
            <Field label="发布节奏规则"><textarea value={rules.publishRules} onChange={(e) => setRule("publishRules", e.target.value)} /></Field>
            <Field label="允许发布时间段"><input value={rules.publishWindow} onChange={(e) => setRule("publishWindow", e.target.value)} /></Field>
          </Card>
          <Card title="品牌规则">
            <Field label="品牌相关内容规则"><textarea value={rules.brandRules} onChange={(e) => setRule("brandRules", e.target.value)} /></Field>
          </Card>
          <button type="button" className="st-btn st-btn--primary" onClick={() => showFeedback("规则已保存，将同步给内容审核 / 发布 Agent")}>保存规则</button>
        </div>
      ) : null}

      {tab === "assetPermissions" ? (
        <Card title="素材权限" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
          <Table
            columns={[
              { key: "role", label: "角色" }, { key: "scope", label: "可见素材范围" },
              { key: "canDownload", label: "可下载", render: (r) => <Pill tone={r.canDownload ? "success" : "neutral"}>{r.canDownload ? "是" : "否"}</Pill> },
              { key: "canDelete", label: "可删除", render: (r) => <Pill tone={r.canDelete ? "success" : "neutral"}>{r.canDelete ? "是" : "否"}</Pill> },
            ]}
            rows={ASSET_PERMISSION_SEED}
          />
        </Card>
      ) : null}

      {tab === "notifications" ? <NotificationsPermissionsPage /> : null}

      {tab === "costLimits" ? (
        <Card title="成本限制" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>超出预算上限的生产任务将自动暂停并转人工确认（演示规则，未接入真实计费系统）。</p>
          {costLimits.map((c) => (
            <Field key={c.id} label={c.label}>
              <input type="number" value={c.value} onChange={(e) => setCostLimit(c.id, e.target.value)} />
            </Field>
          ))}
          <button type="button" className="st-btn st-btn--primary" onClick={() => showFeedback("成本限制已保存")}>保存</button>
        </Card>
      ) : null}

      {tab === "generation" ? (
        <Card title="生成偏好" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
          <Field label="默认视频生成模型">
            <select value={prefs.defaultVideoModel} onChange={(e) => setPref("defaultVideoModel", e.target.value)}>
              <option>Video-Gen v3</option><option>Video-Gen v2</option>
            </select>
          </Field>
          <Field label="默认图片风格"><input value={prefs.defaultImageStyle} onChange={(e) => setPref("defaultImageStyle", e.target.value)} /></Field>
          <Field label="默认配音音色"><input value={prefs.defaultVoice} onChange={(e) => setPref("defaultVoice", e.target.value)} /></Field>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 0" }}>
            <input type="checkbox" checked={prefs.autoSubtitle} onChange={(e) => setPref("autoSubtitle", e.target.checked)} /> 默认自动生成字幕
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 0" }}>
            <input type="checkbox" checked={prefs.autoBgm} onChange={(e) => setPref("autoBgm", e.target.checked)} /> 默认自动匹配 BGM
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "8px 0" }}>
            <input type="checkbox" checked={prefs.preferHumanReviewOnRisk} onChange={(e) => setPref("preferHumanReviewOnRisk", e.target.checked)} /> 风险内容优先转人工而非自动拒绝
          </label>
          <button type="button" className="st-btn st-btn--primary" onClick={() => showFeedback("生成偏好已保存，将作为新项目默认值")}>保存偏好</button>
        </Card>
      ) : null}
    </div>
  );
}
