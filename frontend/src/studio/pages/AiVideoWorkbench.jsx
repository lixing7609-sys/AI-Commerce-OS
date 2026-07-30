import { useState } from "react";
import { getStudioState } from "../mock/studioMock.js";
import { Card, DemoBadge, Field, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";

const TABS = [
  { key: "project", label: "视频项目" },
  { key: "brief", label: "创意简报" },
  { key: "script", label: "脚本" },
  { key: "shotlist", label: "镜头清单" },
  { key: "assets", label: "素材" },
  { key: "generate", label: "视频生成" },
  { key: "edit", label: "剪辑" },
  { key: "voiceSubtitle", label: "配音与字幕" },
  { key: "review", label: "审核" },
  { key: "publish", label: "发布交接" },
  { key: "versions", label: "版本" },
  { key: "preview", label: "预览" },
];

const BRIEF_NOTES = {
  "video-1": "目标：拉动 11 月新品搜索与加购；核心卖点为静音+高雾量；风格贴近小红书种草口吻。",
  "video-2": "目标：双十一预热期引爆抖音信息流；15 秒强钩子开场，前 3 秒必须出现优惠力度。",
  "video-3": "目标：品牌栏目调性访谈，塑造创始人专业形象；预告片以悬念剪辑为主，正片另行规划。",
  "video-4": "目标：跨境贸易纪实向 Vlog，增强账号真实感与信任背书，弱化广告感。",
};

const VOICE_SUBTITLE_STATUS = {
  "video-1": { voice: "AI配音已完成", subtitle: "字幕已生成", bgm: "已匹配" },
  "video-2": { voice: "AI配音已完成", subtitle: "字幕已生成", bgm: "已匹配" },
  "video-3": { voice: "未开始", subtitle: "未开始", bgm: "未选择" },
  "video-4": { voice: "AI配音已完成", subtitle: "字幕已生成", bgm: "已匹配" },
};

const VERSION_HISTORY = {
  "video-1": [
    { version: "v2", note: "根据审核意见调整了产品特写镜头顺序", updatedAt: "2 小时前" },
    { version: "v1", note: "首版生成", updatedAt: "1 天前" },
  ],
  "video-2": [{ version: "v1", note: "首版生成", updatedAt: "6 小时前" }],
  "video-3": [{ version: "v1", note: "脚本草稿版本", updatedAt: "3 天前" }],
  "video-4": [
    { version: "v3", note: "已发布版本，剪去 8 秒冗余画面", updatedAt: "5 天前" },
    { version: "v2", note: "补充字幕", updatedAt: "6 天前" },
    { version: "v1", note: "首版生成", updatedAt: "7 天前" },
  ],
};

const REVIEW_TONE = { 已完成: "success", 已发布: "success", 生成中: "info", 剪辑中: "warning", 脚本: "neutral", 未开始: "neutral" };

/**
 * Studio Lab · AI 视频（Charter §3.4）——视频项目 / 创意简报 / 脚本 /
 * 镜头清单 / 素材 / 视频生成 / 剪辑 / 配音与字幕 / 审核 / 发布交接 /
 * 版本 / 预览。`aiVideoTasks` 提供每个任务的脚本/分镜/素材/模型/成本
 * /发布字段，其余需求简报、配音字幕、版本历史用小型本地演示数据
 * 补齐，与仓库里其它工作台（如 AiArticleWorkbench 的 ARTICLES）同一
 * 模式，不接入真实生成模型。
 */
export function AiVideoWorkbench() {
  const [tab, setTab] = useState("project");
  const { aiVideoTasks } = getStudioState();
  const [feedback, showFeedback] = useInlineFeedback();
  const [previewTaskId, setPreviewTaskId] = useState(aiVideoTasks[0]?.taskId ?? null);
  const previewTask = aiVideoTasks.find((t) => t.taskId === previewTaskId) ?? aiVideoTasks[0];

  return (
    <Card title="AI 视频" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "project" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "template", label: "视频模板" },
            { key: "stage", label: "当前进度" },
            { key: "publishPlatform", label: "目标平台" },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "brief" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "template", label: "视频模板" },
            { key: "brief", label: "创意简报要点", render: (r) => BRIEF_NOTES[r.taskId] ?? "暂无简报" },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "script" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "scriptStatus", label: "脚本状态", render: (r) => <Pill tone={REVIEW_TONE[r.scriptStatus] ?? "neutral"}>{r.scriptStatus}</Pill> },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "shotlist" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "storyboardStatus", label: "分镜状态", render: (r) => <Pill tone={REVIEW_TONE[r.storyboardStatus] ?? "neutral"}>{r.storyboardStatus}</Pill> },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "assets" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "assetStatus", label: "素材状态" },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "generate" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "generationModel", label: "生成模型" },
            { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() },
            { key: "computeCost", label: "算力成本" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已提交「${r.name}」重新生成请求（演示，未产生真实模型调用）`)}>重新生成</button>
              ),
            },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "edit" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "stage", label: "当前进度" },
            { key: "assetStatus", label: "素材状态" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已对「${r.name}」执行自动粗剪`)}>自动粗剪</button>
              ),
            },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "voiceSubtitle" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "voice", label: "配音", render: (r) => VOICE_SUBTITLE_STATUS[r.taskId]?.voice ?? "未开始" },
            { key: "subtitle", label: "字幕", render: (r) => VOICE_SUBTITLE_STATUS[r.taskId]?.subtitle ?? "未开始" },
            { key: "bgm", label: "BGM", render: (r) => VOICE_SUBTITLE_STATUS[r.taskId]?.bgm ?? "未选择" },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "review" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "stage", label: "当前进度" },
            {
              key: "actions", label: "操作", render: (r) => (
                <span className="st-btn-row">
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已批准「${r.name}」`)}>批准</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已驳回「${r.name}」，等待修改`)}>驳回</button>
                </span>
              ),
            },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "publish" ? (
        <Table
          columns={[
            { key: "name", label: "视频项目" },
            { key: "publishPlatform", label: "发布平台" },
            { key: "performance", label: "数据表现" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已将「${r.name}」交接到发布中心`)}>交接到发布中心</button>
              ),
            },
          ]}
          rows={aiVideoTasks}
        />
      ) : null}

      {tab === "versions" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {aiVideoTasks.map((t) => (
            <Card key={t.taskId} title={t.name}>
              <Table
                columns={[
                  { key: "version", label: "版本" },
                  { key: "note", label: "变更说明" },
                  { key: "updatedAt", label: "更新时间" },
                ]}
                rows={(VERSION_HISTORY[t.taskId] ?? []).map((v, idx) => ({ id: `${t.taskId}-${idx}`, ...v }))}
                empty="暂无版本记录"
              />
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "preview" ? (
        <div>
          <Field label="选择视频项目">
            <select value={previewTaskId ?? ""} onChange={(e) => setPreviewTaskId(e.target.value)}>
              {aiVideoTasks.map((t) => <option key={t.taskId} value={t.taskId}>{t.name}</option>)}
            </select>
          </Field>
          {previewTask ? (
            <div className="st-card" style={{ margin: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 220, borderRadius: 10, background: "var(--surface-2, rgba(148,163,184,.12))", fontSize: 13, color: "var(--text-secondary)" }}>
                视频预览占位 · {previewTask.name}（{previewTask.stage}）
              </div>
              <div className="st-btn-row" style={{ marginTop: 12 }}>
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback("已生成预览片段（演示）")}>生成预览</button>
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback("已复制预览分享链接（演示）")}>分享预览</button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
