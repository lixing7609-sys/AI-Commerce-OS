import { useState } from "react";
import { Card, DemoBadge, Field, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";

const TABS = [
  { key: "project", label: "音频项目" },
  { key: "script", label: "文稿" },
  { key: "voice", label: "音色" },
  { key: "dub", label: "配音" },
  { key: "bgm", label: "背景音乐" },
  { key: "sfx", label: "音效" },
  { key: "timeline", label: "时间轴" },
  { key: "preview", label: "试听" },
  { key: "review", label: "审核" },
  { key: "export", label: "导出" },
  { key: "versions", label: "版本" },
  { key: "cost", label: "成本" },
];

const AUDIO_PROJECTS = [
  {
    id: "p1", title: "《一人公司经营笔记》EP12", type: "播客", stage: "剪辑中", durationMin: 18, status: "in_progress",
    script: "开场：今天聊聊一人公司如何用 AI Agent 替代团队分工……（完整文稿共 2,600 字）",
    voiceProfile: "沉稳青年音（周启）", bgm: "商业观察节奏版", sfx: ["转场提示音", "重点强调音效"],
    reviewStatus: "待审核", tokenCost: 3200, computeCost: 6,
    versions: [{ version: "v2", note: "补充结尾行动号召", updatedAt: "3 小时前" }, { version: "v1", note: "首版录制", updatedAt: "1 天前" }],
  },
  {
    id: "p2", title: "《一人公司经营笔记》EP11", type: "播客", stage: "已发布", durationMin: 21, status: "published",
    script: "开场：本期聊聊内容矩阵账号的健康度管理……（完整文稿共 3,100 字）",
    voiceProfile: "沉稳青年音（周启）", bgm: "商业观察节奏版", sfx: ["转场提示音"],
    reviewStatus: "已通过", tokenCost: 3600, computeCost: 7,
    versions: [{ version: "v1", note: "首版录制，已发布", updatedAt: "6 天前" }],
  },
  {
    id: "va1", title: "夏季新品加湿器选购指南（音频版）", type: "长文转音频", stage: "已生成", durationMin: 6, status: "ready",
    script: "改编自 AI 文章《夏季新品加湿器选购指南》，已按口语化风格重写。",
    voiceProfile: "清亮少女音（林晚）", bgm: "温馨治愈版", sfx: [],
    reviewStatus: "已通过", tokenCost: 900, computeCost: 1,
    versions: [{ version: "v1", note: "由文章一键生成", updatedAt: "2 天前" }],
  },
  {
    id: "va2", title: "抖音小店新手起号避坑指南（音频版）", type: "长文转音频", stage: "生成中", durationMin: 9, status: "generating",
    script: "改编自 AI 文章《抖音小店新手起号避坑指南》，正在生成语音。",
    voiceProfile: "低沉中年音（陆总）", bgm: "悬疑铺垫版", sfx: [],
    reviewStatus: "待审核", tokenCost: 1200, computeCost: 2,
    versions: [{ version: "v1", note: "生成中", updatedAt: "刚刚" }],
  },
];

const VOICE_LIBRARY = [
  { id: "v1", name: "沉稳青年音（周启）", type: "克隆音色", status: "已就绪" },
  { id: "v2", name: "清亮少女音（林晚）", type: "克隆音色", status: "已就绪" },
  { id: "v3", name: "低沉中年音（陆总）", type: "标准音色库", status: "已就绪" },
];

const BGM_LIBRARY = ["逆袭情绪版", "悬疑铺垫版", "温馨治愈版", "商业观察节奏版"];
const SFX_LIBRARY = ["转场提示音", "重点强调音效", "开场提示音", "结尾收束音"];

const STATUS_LABEL = { in_progress: "生产中", published: "已发布", ready: "已生成", generating: "生成中" };
const STATUS_TONE = { in_progress: "warning", published: "success", ready: "success", generating: "warning" };
const REVIEW_TONE = { 已通过: "success", 待审核: "warning" };

/**
 * Studio Lab · AI 音频（Charter §3.4）——音频项目 / 文稿 / 音色 /
 * 配音 / 背景音乐 / 音效 / 时间轴 / 试听 / 审核 / 导出 / 版本 / 成本。
 * `AUDIO_PROJECTS` 覆盖播客与长文转音频两类项目，与仓库其它工作台
 * 一致，使用小型本地演示数据，不接入真实 TTS / 音频合成模型。
 */
export function AiAudioWorkbench() {
  const [tab, setTab] = useState("project");
  const [feedback, showFeedback] = useInlineFeedback();
  const [previewId, setPreviewId] = useState(AUDIO_PROJECTS[0].id);
  const previewProject = AUDIO_PROJECTS.find((p) => p.id === previewId) ?? AUDIO_PROJECTS[0];

  return (
    <Card title="AI 音频" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "project" ? (
        <Table
          columns={[
            { key: "title", label: "音频项目" }, { key: "type", label: "类型" }, { key: "stage", label: "阶段" }, { key: "durationMin", label: "时长(分钟)" },
            { key: "status", label: "状态", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill> },
          ]}
          rows={AUDIO_PROJECTS}
        />
      ) : null}

      {tab === "script" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {AUDIO_PROJECTS.map((p) => (
            <Card key={p.id} title={p.title}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{p.script}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "voice" ? (
        <Table
          columns={[
            { key: "name", label: "音色" }, { key: "type", label: "类型" }, { key: "status", label: "状态", render: (r) => <Pill tone="success">{r.status}</Pill> },
            { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已试听音色「${r.name}」`)}>试听</button> },
          ]}
          rows={VOICE_LIBRARY}
        />
      ) : null}

      {tab === "dub" ? (
        <Table
          columns={[
            { key: "title", label: "音频项目" }, { key: "voiceProfile", label: "配音音色" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已为「${r.title}」重新生成配音`)}>重新配音</button>
              ),
            },
          ]}
          rows={AUDIO_PROJECTS}
        />
      ) : null}

      {tab === "bgm" ? (
        <div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>BGM 库（点击应用到当前选中的试听项目）</p>
          <div className="st-btn-row" style={{ marginBottom: 14 }}>
            {BGM_LIBRARY.map((bgm) => <button key={bgm} type="button" className="st-tab" onClick={() => showFeedback(`已将 BGM「${bgm}」应用到「${previewProject.title}」`)}>{bgm}</button>)}
          </div>
          <Table columns={[{ key: "title", label: "音频项目" }, { key: "bgm", label: "当前 BGM" }]} rows={AUDIO_PROJECTS} />
        </div>
      ) : null}

      {tab === "sfx" ? (
        <div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>音效库</p>
          <div className="st-btn-row" style={{ marginBottom: 14 }}>
            {SFX_LIBRARY.map((sfx) => <button key={sfx} type="button" className="st-tab" onClick={() => showFeedback(`已插入音效「${sfx}」`)}>{sfx}</button>)}
          </div>
          <Table columns={[{ key: "title", label: "音频项目" }, { key: "sfx", label: "已使用音效", render: (r) => (r.sfx.length ? r.sfx.join("、") : "暂无") }]} rows={AUDIO_PROJECTS} />
        </div>
      ) : null}

      {tab === "timeline" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {AUDIO_PROJECTS.map((p) => (
            <Card key={p.id} title={p.title}>
              <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 11 }}>
                <span className="st-flow-step">配音轨</span><span className="st-flow-arrow">·</span>
                <span className="st-flow-step">BGM 轨（{p.bgm}）</span><span className="st-flow-arrow">·</span>
                <span className="st-flow-step">音效轨（{p.sfx.length} 处）</span>
              </div>
              <div style={{ marginTop: 8, height: 28, borderRadius: 6, background: "var(--surface-2, rgba(148,163,184,.12))", position: "relative" }}>
                <span style={{ position: "absolute", left: 8, top: 6, fontSize: 11, color: "var(--text-secondary)" }}>0:00</span>
                <span style={{ position: "absolute", right: 8, top: 6, fontSize: 11, color: "var(--text-secondary)" }}>{p.durationMin}:00</span>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "preview" ? (
        <div>
          <Field label="选择音频项目">
            <select value={previewId} onChange={(e) => setPreviewId(e.target.value)}>
              {AUDIO_PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          </Field>
          <div className="st-card" style={{ margin: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, margin: "0 0 8px" }}>{previewProject.title}</p>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 12px" }}>{previewProject.voiceProfile} · {previewProject.durationMin} 分钟 · BGM：{previewProject.bgm}</p>
            <button type="button" className="st-btn st-btn--primary st-btn-sm" onClick={() => showFeedback(`正在试听「${previewProject.title}」（演示，未接入真实音频流）`)}>▶ 试听</button>
          </div>
        </div>
      ) : null}

      {tab === "review" ? (
        <Table
          columns={[
            { key: "title", label: "音频项目" },
            { key: "reviewStatus", label: "审核状态", render: (r) => <Pill tone={REVIEW_TONE[r.reviewStatus]}>{r.reviewStatus}</Pill> },
            {
              key: "actions", label: "操作", render: (r) => (
                <span className="st-btn-row">
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已批准「${r.title}」`)}>批准</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已驳回「${r.title}」`)}>驳回</button>
                </span>
              ),
            },
          ]}
          rows={AUDIO_PROJECTS}
        />
      ) : null}

      {tab === "export" ? (
        <Table
          columns={[
            { key: "title", label: "音频项目" }, { key: "durationMin", label: "时长(分钟)" },
            {
              key: "actions", label: "操作", render: (r) => (
                <span className="st-btn-row">
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已导出「${r.title}」为 MP3（演示）`)}>导出 MP3</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已导出「${r.title}」为 WAV（演示）`)}>导出 WAV</button>
                </span>
              ),
            },
          ]}
          rows={AUDIO_PROJECTS}
        />
      ) : null}

      {tab === "versions" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {AUDIO_PROJECTS.map((p) => (
            <Card key={p.id} title={p.title}>
              <Table columns={[{ key: "version", label: "版本" }, { key: "note", label: "变更说明" }, { key: "updatedAt", label: "更新时间" }]} rows={p.versions.map((v, idx) => ({ id: `${p.id}-${idx}`, ...v }))} />
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "cost" ? (
        <Table
          columns={[
            { key: "title", label: "音频项目" },
            { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() },
            { key: "computeCost", label: "算力成本" },
          ]}
          rows={AUDIO_PROJECTS}
        />
      ) : null}
    </Card>
  );
}
