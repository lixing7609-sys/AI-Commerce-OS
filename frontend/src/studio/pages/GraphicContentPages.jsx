import { useState } from "react";
import {
  GRAPHIC_WORKFLOW_STAGES, GRAPHIC_TYPE_LABEL, PLATFORM_VARIANT_LABEL, getGraphicContentState,
  getGraphicProjectBlocks, updateContentBlock, addContentBlock, removeContentBlock, reorderContentBlock,
  aiRewriteBlock, regenerateBlockImage, advanceGraphicStage, createPlatformVariant,
} from "../mock/graphicContentMock.js";
import { ProjectCreationModal } from "./ProjectCreationModal.jsx";
import { Card, DemoBadge, Field, Pill, Table, Tabs } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatMoney, formatNumber } from "./formatters.js";

const STATUS_LABEL = { planning: "策划中", in_production: "生产中", in_review: "审核中", published: "已发布", archived: "已归档" };
const STATUS_TONE = { planning: "neutral", in_production: "info", in_review: "warning", published: "success", archived: "neutral" };
const BLOCK_TYPE_LABEL = {
  heading: "标题", paragraph: "段落", quote: "引用", list: "清单", table: "表格", image: "图片",
  infographic: "信息图", "product-card": "商品卡片", "data-card": "数据卡片", callout: "重点提示", CTA: "行动号召", separator: "分隔线",
};

/* ============================ AI图文项目列表 ============================ */

export function GraphicContentListPage({ navigate }) {
  const { projects } = getGraphicContentState();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <Card
      title="AI图文"
      action={<span className="st-btn-row"><button type="button" className="st-btn st-btn--primary st-btn-sm" onClick={() => setCreateOpen(true)}>＋ 新建 AI图文项目</button><DemoBadge /></span>}
    >
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
        AI图文是与 AI短剧 / AI视频 / AI直播并列的一级内容形态——覆盖小红书图文、公众号文章、知乎回答、头条文章、商品种草等完整生产与运营能力，不是"生成一张图"。
      </p>
      <Table
        columns={[
          { key: "name", label: "项目名称" },
          { key: "graphicType", label: "图文类型", render: (r) => GRAPHIC_TYPE_LABEL[r.graphicType] ?? r.graphicType },
          { key: "targetPlatforms", label: "目标平台", render: (r) => r.targetPlatforms.map((p) => PLATFORM_VARIANT_LABEL[p] ?? p).join("、") },
          { key: "stage", label: "当前阶段", render: (r) => GRAPHIC_WORKFLOW_STAGES.find((s) => s.stageKey === r.stage)?.name ?? r.stage },
          { key: "status", label: "状态", render: (r) => <Pill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Pill> },
          { key: "monetizationModel", label: "变现方式" },
          { key: "tokenUsed", label: "已用 Token", render: (r) => r.tokenUsed.toLocaleString() },
        ]}
        rows={projects}
        onRowClick={(r) => navigate("graphicContentEditor", { projectId: r.projectId })}
      />
      <ProjectCreationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        presetType="graphic"
        onCreated={({ project }) => { setCreateOpen(false); navigate("graphicContentEditor", { projectId: project.projectId }); }}
      />
    </Card>
  );
}

/* ============================ AI图文编辑器（三栏工作台） ============================ */

const DEFAULT_GRAPHIC_PROJECT_ID = "gproj-1";

export function GraphicContentEditorPage({ navigate, params = {} }) {
  const [createOpen, setCreateOpen] = useState(!!params.openCreate);
  const [projectId, setProjectId] = useState(params.projectId || (params.openCreate ? null : DEFAULT_GRAPHIC_PROJECT_ID));
  const [tab, setTab] = useState("editor");
  const [feedback, showFeedback] = useInlineFeedback();
  const [, setRefreshTick] = useState(0);

  const { projects, variants, seoKeywords, publishTasks, metrics, revenue } = getGraphicContentState();
  const project = projectId ? projects.find((p) => p.projectId === projectId) : null;
  const blocks = projectId ? getGraphicProjectBlocks(projectId) : [];
  const [selectedBlockId, setSelectedBlockId] = useState(() => blocks[0]?.blockId ?? null);
  const selectedBlock = blocks.find((b) => b.blockId === selectedBlockId) ?? blocks[0] ?? null;

  function forceRefresh() { setRefreshTick((t) => t + 1); }

  const projectVariants = variants.filter((v) => v.projectId === projectId);
  const projectMetrics = metrics.filter((m) => m.projectId === projectId);
  const projectRevenue = revenue.filter((r) => r.projectId === projectId);
  const projectPublishTasks = publishTasks.filter((t) => t.projectId === projectId);

  async function handleBlockUpdate(patch) {
    await updateContentBlock(projectId, selectedBlock.blockId, patch);
    forceRefresh();
  }
  async function handleAddBlock(type) {
    await addContentBlock(projectId, type, selectedBlock?.order ?? blocks.length);
    showFeedback(`已新增「${BLOCK_TYPE_LABEL[type]}」内容块`);
    forceRefresh();
  }
  async function handleRemoveBlock(blockId) {
    await removeContentBlock(projectId, blockId);
    forceRefresh();
  }
  async function handleReorderBlock(direction) {
    await reorderContentBlock(projectId, selectedBlock.blockId, direction);
    forceRefresh();
  }
  async function handleRewrite(mode) {
    await aiRewriteBlock(projectId, selectedBlock.blockId, mode);
    showFeedback("AI 已改写该内容块");
    forceRefresh();
  }
  async function handleRegenerateImage() {
    await regenerateBlockImage(projectId, selectedBlock.blockId);
    showFeedback("已重新生成配图");
    forceRefresh();
  }
  async function handleAdvanceStage(nextStage) {
    await advanceGraphicStage(projectId, nextStage);
    showFeedback("已推进到下一阶段");
    forceRefresh();
  }
  async function handleCreateVariant(platform) {
    await createPlatformVariant(projectId, platform);
    showFeedback(`已生成${PLATFORM_VARIANT_LABEL[platform]}版本草稿`);
    forceRefresh();
  }

  if (createOpen || !projectId) {
    return (
      <ProjectCreationModal
        open
        onClose={() => { setCreateOpen(false); if (!projectId) navigate("graphicContent"); }}
        presetType="graphic"
        onCreated={({ project: created }) => { setCreateOpen(false); setProjectId(created.projectId); navigate("graphicContentEditor", { projectId: created.projectId }); }}
      />
    );
  }

  if (!project) {
    return (
      <Card title="AI图文编辑器">
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>未找到该图文项目。</p>
        <button type="button" className="st-btn" onClick={() => navigate("graphicContent")}>返回项目列表</button>
      </Card>
    );
  }

  const activeStageIndex = GRAPHIC_WORKFLOW_STAGES.findIndex((s) => s.stageKey === project.stage);

  return (
    <div>
      <div className="st-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <b style={{ fontSize: 15 }}>AI图文编辑器 · {project.name}</b>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)" }}>{GRAPHIC_TYPE_LABEL[project.graphicType]} · 目标平台：{project.targetPlatforms.map((p) => PLATFORM_VARIANT_LABEL[p] ?? p).join("、")}</p>
        </div>
        {feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}
      </div>

      <Tabs tabs={[
        { key: "editor", label: "编辑" }, { key: "variants", label: "平台版本" },
        { key: "publish", label: "发布" }, { key: "metrics", label: "数据" }, { key: "revenue", label: "变现" },
      ]} active={tab} onChange={setTab} />

      {tab === "editor" ? (
        <div className="st-workspace">
          <aside className="st-workspace-col">
            <div className="st-workspace-col-head"><h3>项目资料与图文资产</h3><p>{project.name}</p></div>
            <div className="st-workspace-col-body">
              <div className="st-asset-item">🔥 关联热点 · {project.relatedTrendId ?? "无"}</div>
              <div className="st-asset-item">📦 关联商品 · {project.relatedProductId ?? "无"}</div>
              <div className="st-asset-item">🧠 知识库 · 平台风格规范库</div>
              <div className="st-asset-item">🧩 Skill · 图文SEO关键词布局</div>
              <div className="st-asset-item">📋 目标平台 · {project.targetPlatforms.join("、")}</div>
              <div className="st-asset-item">📊 SEO 关键词<br />{seoKeywords.slice(0, 3).map((k) => k.keyword).join("、")}</div>
            </div>
          </aside>

          <main className="st-workspace-col">
            <div className="st-workspace-col-head"><h3>14 阶段生产流程 · 图文编辑画布</h3><p>点击阶段推进；下方为结构化内容块，可增删排序</p></div>
            <div className="st-workspace-col-body" style={{ maxHeight: "none" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
                {GRAPHIC_WORKFLOW_STAGES.map((s, idx) => (
                  <Pill key={s.stageKey} tone={idx < activeStageIndex ? "success" : idx === activeStageIndex ? "info" : "neutral"}>
                    {s.order}. {s.name}
                  </Pill>
                ))}
              </div>
              <button type="button" className="st-btn st-btn--primary st-btn-sm" style={{ marginBottom: 12 }} onClick={() => handleAdvanceStage(GRAPHIC_WORKFLOW_STAGES[Math.min(activeStageIndex + 1, GRAPHIC_WORKFLOW_STAGES.length - 1)].stageKey)}>
                锁定当前阶段并继续下一阶段
              </button>

              {blocks.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>暂无内容块，点击下方按钮生成第一个内容块。</p>
              ) : (
                blocks.map((b) => (
                  <div key={b.blockId} className={`st-content-block${selectedBlockId === b.blockId ? " selected" : ""}${b.locked ? " locked" : ""}`} onClick={() => setSelectedBlockId(b.blockId)}>
                    <div className="st-content-block-type">{BLOCK_TYPE_LABEL[b.type]}{b.locked ? " · 已锁定" : ""}</div>
                    <div className="st-content-block-text">{b.text || b.imageRequirement || "（空）"}</div>
                  </div>
                ))
              )}
              <div className="st-btn-row" style={{ marginTop: 8 }}>
                {["paragraph", "image", "list", "product-card", "CTA"].map((t) => (
                  <button key={t} type="button" className="st-btn st-btn-sm" onClick={() => handleAddBlock(t)}>＋ {BLOCK_TYPE_LABEL[t]}</button>
                ))}
              </div>
            </div>
          </main>

          <aside className="st-workspace-col">
            <div className="st-workspace-col-head"><h3>当前内容块检查器</h3><p>人工可随时调整 Agent 输出</p></div>
            <div className="st-workspace-col-body">
              {selectedBlock ? (
                <>
                  <Field label="内容块类型"><input value={BLOCK_TYPE_LABEL[selectedBlock.type]} disabled /></Field>
                  <Field label="文本内容"><textarea value={selectedBlock.text} onChange={(e) => handleBlockUpdate({ text: e.target.value })} /></Field>
                  <Field label="语气"><input value={selectedBlock.tone} onChange={(e) => handleBlockUpdate({ tone: e.target.value })} /></Field>
                  <Field label="平台风格"><input value={selectedBlock.platformStyle} onChange={(e) => handleBlockUpdate({ platformStyle: e.target.value })} /></Field>
                  <Field label="SEO 权重"><input type="number" value={selectedBlock.seoWeight} onChange={(e) => handleBlockUpdate({ seoWeight: Number(e.target.value) })} /></Field>
                  <div className="st-field-row">
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={selectedBlock.keepBrandTone} onChange={(e) => handleBlockUpdate({ keepBrandTone: e.target.checked })} />保留品牌语气</label>
                    <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={selectedBlock.allowExaggeration} onChange={(e) => handleBlockUpdate({ allowExaggeration: e.target.checked })} />允许夸张表达</label>
                  </div>
                  {selectedBlock.type === "image" || selectedBlock.type === "infographic" ? (
                    <>
                      <Field label="配图要求"><textarea value={selectedBlock.imageRequirement} onChange={(e) => handleBlockUpdate({ imageRequirement: e.target.value })} /></Field>
                      <Field label="图片比例"><input value={selectedBlock.imageRatio} onChange={(e) => handleBlockUpdate({ imageRatio: e.target.value })} /></Field>
                      <Field label="图片风格"><input value={selectedBlock.imageStyle} onChange={(e) => handleBlockUpdate({ imageStyle: e.target.value })} /></Field>
                    </>
                  ) : null}
                  <div className="st-card" style={{ margin: "0 0 10px", padding: 11 }}>
                    <h4 style={{ fontSize: 11, margin: "0 0 8px" }}>合规与质量</h4>
                    <p style={{ fontSize: 11 }}>合规风险：{selectedBlock.complianceRisk} · 重复度：{selectedBlock.duplicateRate}% · 单块生成成本 {formatMoney(selectedBlock.generationCost)}</p>
                    {selectedBlock.aiSuggestion ? <p style={{ fontSize: 11, color: "var(--st-accent, #0D9488)" }}>AI 建议：{selectedBlock.aiSuggestion}</p> : null}
                  </div>
                  <div className="st-btn-row">
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRewrite("expand")}>扩写</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRewrite("shorten")}>缩写</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRewrite("tone")}>改变语气</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRewrite("platform")}>改成平台风格</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRewrite("case")}>增加案例</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRewrite("data")}>增加数据</button>
                    {selectedBlock.type === "image" || selectedBlock.type === "infographic" ? (
                      <button type="button" className="st-btn st-btn-sm" onClick={handleRegenerateImage}>重新生成配图</button>
                    ) : null}
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleReorderBlock("up")}>上移</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleReorderBlock("down")}>下移</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleBlockUpdate({ locked: !selectedBlock.locked })}>{selectedBlock.locked ? "解锁" : "锁定"}</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => handleRemoveBlock(selectedBlock.blockId)}>删除</button>
                  </div>
                </>
              ) : <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>暂无选中内容块。</p>}
            </div>
          </aside>
        </div>
      ) : null}

      {tab === "variants" ? (
        <Card title="多平台版本">
          <div className="st-btn-row" style={{ marginBottom: 12 }}>
            {Object.entries(PLATFORM_VARIANT_LABEL).map(([key, label]) => (
              <button key={key} type="button" className="st-btn st-btn-sm" onClick={() => handleCreateVariant(key)}>＋ 生成{label}版本</button>
            ))}
          </div>
          <Table
            columns={[
              { key: "platform", label: "平台", render: (r) => PLATFORM_VARIANT_LABEL[r.platform] ?? r.platform },
              { key: "title", label: "标题" }, { key: "tags", label: "标签", render: (r) => r.tags.join("、") },
              { key: "summary", label: "摘要" },
              { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "published" ? "success" : r.status === "approved" ? "info" : r.status === "in_review" ? "warning" : "neutral"}>{{ draft: "草稿", in_review: "审核中", approved: "已批准", published: "已发布" }[r.status]}</Pill> },
            ]}
            rows={projectVariants}
          />
        </Card>
      ) : null}

      {tab === "publish" ? (
        <Card title="矩阵发布">
          <Table
            columns={[
              { key: "platform", label: "平台" }, { key: "accountId", label: "账号" },
              { key: "scheduledAt", label: "计划发布时间" },
              { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "published" ? "success" : r.status === "failed" ? "danger" : "info"}>{{ scheduled: "已排期", publishing: "发布中", published: "已发布", failed: "失败" }[r.status]}</Pill> },
              { key: "contentUrl", label: "内容URL", render: (r) => r.contentUrl || "—" },
              { key: "dataSyncStatus", label: "数据回流", render: (r) => (r.dataSyncStatus === "synced" ? "已同步" : "待同步") },
            ]}
            rows={projectPublishTasks}
            empty="暂无发布任务，先在「平台版本」标签生成至少一个平台版本再发布。"
          />
        </Card>
      ) : null}

      {tab === "metrics" ? (
        <Card title="流量与搜索表现">
          <Table
            columns={[
              { key: "impressions", label: "曝光", render: (r) => formatNumber(r.impressions) },
              { key: "reads", label: "阅读", render: (r) => formatNumber(r.reads) },
              { key: "clickRate", label: "点击率", render: (r) => `${r.clickRate}%` },
              { key: "completionRate", label: "阅读完成率", render: (r) => `${r.completionRate}%` },
              { key: "saves", label: "收藏", render: (r) => formatNumber(r.saves) },
              { key: "shares", label: "转发", render: (r) => formatNumber(r.shares) },
              { key: "newFollowers", label: "新增关注" },
              { key: "searchEntries", label: "搜索进入量", render: (r) => formatNumber(r.searchEntries) },
              { key: "productClicks", label: "商品点击" },
              { key: "conversions", label: "成交" },
            ]}
            rows={projectMetrics}
            empty="暂无数据，发布后回流。"
          />
        </Card>
      ) : null}

      {tab === "revenue" ? (
        <Card title="图文变现">
          <Table
            columns={[
              { key: "category", label: "收入类型" }, { key: "revenue", label: "收入", render: (r) => formatMoney(r.revenue) },
              { key: "generationCost", label: "生成成本", render: (r) => formatMoney(r.generationCost) },
              { key: "imageCost", label: "配图成本", render: (r) => formatMoney(r.imageCost) },
              { key: "adCost", label: "分发/广告成本", render: (r) => formatMoney(r.adCost) },
              { key: "grossMargin", label: "毛利", render: (r) => formatMoney(r.grossMargin) },
              { key: "settlementStatus", label: "结算状态" },
            ]}
            rows={projectRevenue}
            empty="暂无收入记录。"
          />
        </Card>
      ) : null}
    </div>
  );
}
