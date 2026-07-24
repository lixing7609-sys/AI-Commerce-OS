import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import { getCategoriesForStore, getProductsForStoreCategory } from "../../mock/productMock.js";
import { getAllTrends } from "../../mock/trendMock.js";
import {
  CONTENT_TYPES,
  REPURPOSING_LEVELS,
  createRepurposingTask,
  getContentState,
  getRepurposingBoundaries,
  retryMockPublishing,
  runComplianceCheck,
  runCopyrightCheck,
  runOriginalityCheck,
  submitApproval,
} from "../../mock/contentMock.js";

const STATUS_TONE = {
  新发现: "neutral", 待评估: "neutral", 建议跟进: "info", 已忽略: "neutral", 策划中: "neutral",
  二创中: "info", 生产中: "info", 原创检查: "warning", 版权检查: "warning", 合规检查: "warning",
  待审批: "warning", 待发布: "info", 发布中: "warning", 已发布: "success", 发布失败: "danger",
  表现观察中: "info", 已复盘: "success",
};

const CHANNELS = ["抖音", "小红书", "视频号", "淘宝逛逛", "朋友圈", "直播间"];

function LevelExplainer() {
  const boundaries = getRepurposingBoundaries();
  return (
    <div className="fdr-card">
      <h3 className="fdr-card__title">二创边界说明</h3>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
        二创工作台不代表复制、洗稿、去水印或未授权转载——只做以下允许的事情，并明确标注不允许的事情。
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <StatusPill tone="success">允许</StatusPill>
          <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
            {boundaries.allowed.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
        <div>
          <StatusPill tone="danger">不允许 / 需授权</StatusPill>
          <ul style={{ fontSize: 12, marginTop: 8, paddingLeft: 18 }}>
            {boundaries.disallowed.map((a) => <li key={a}>{a}</li>)}
          </ul>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 16 }}>
        {REPURPOSING_LEVELS.map((l) => (
          <div key={l.key} className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
            <strong style={{ fontSize: 13 }}>{l.label}</strong>
            <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{l.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StartWizard({ onCreated }) {
  const toast = useToast();
  const [trendId, setTrendId] = useState("");
  const [storeId, setStoreId] = useState(DEMO_STORES[0].id);
  const [category, setCategory] = useState("");
  const [product, setProduct] = useState("");
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [format, setFormat] = useState(CONTENT_TYPES[0]);
  const [level, setLevel] = useState("deep");
  const [directions, setDirections] = useState([]);
  const [selectedDirection, setSelectedDirection] = useState(null);
  const [script, setScript] = useState(null);

  const trends = getAllTrends();
  const categories = storeId ? getCategoriesForStore(storeId) : [];
  const products = storeId && category ? getProductsForStoreCategory(storeId, category) : [];
  const selectedTrend = trends.find((t) => t.id === trendId);

  function generateDirections() {
    const base = selectedTrend?.title ?? "自有商品选题";
    setDirections([
      `方向一（轻量适配）：直接用「${base}」作为标题钩子，突出商品核心卖点`,
      `方向二（深度二创）：围绕「${base}」重新设计场景与人设，制作全新脚本`,
      `方向三（热点借势原创）：只借用「${base}」的话题热度，内容完全原创，聚焦自有商品故事`,
    ]);
  }

  function generateScriptForDirection() {
    setScript(
      `（演示脚本）针对渠道「${channel}」、形式「${format}」生成的开场钩子与卖点讲解草稿，选定方向：${selectedDirection}`
    );
  }

  function handleCreate() {
    createRepurposingTask({
      trendSource: selectedTrend ? `${selectedTrend.source} · ${selectedTrend.title}` : "自有选题",
      trendSnapshot: selectedTrend?.title ?? "自有商品选题",
      sourceUrlPlaceholder: "https://mock.trend-source.example/workbench",
      sourceType: selectedTrend?.sourceType ?? "internal",
      referenceContent: selectedDirection,
      authorizationStatus: "无需授权（仅参考选题信号）",
      storeId,
      category,
      product,
      targetAudience: selectedTrend?.targetAudience ?? "店铺目标受众",
      creativeAngle: selectedDirection,
      contentFormat: format,
      brandExpression: "沿用店铺品牌语气",
      selfOwnedAssets: [],
      repurposingLevel: level,
      riskLevel: selectedTrend?.complianceRisk ?? "低",
      promptVersion: "二创脚本生成 Prompt v1",
      skillVersion: "二创脚本生成 v1",
      knowledgeVersion: "商品短视频脚本结构知识 v1",
      model: "Claude Sonnet 5",
      publishingChannels: [channel],
      status: "生产中",
    });
    toast("二创任务已创建，进入检查流程", "success");
    setDirections([]);
    setSelectedDirection(null);
    setScript(null);
    onCreated();
  }

  return (
    <div className="fdr-card">
      <h3 className="fdr-card__title">开始新的二创任务</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">1. 选择热点（可选）</label>
          <select className="fdr-select" value={trendId} onChange={(e) => setTrendId(e.target.value)}>
            <option value="">不使用热点（自有选题）</option>
            {trends.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">2. 选择店铺</label>
          <select className="fdr-select" value={storeId} onChange={(e) => { setStoreId(e.target.value); setCategory(""); setProduct(""); }}>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">3. 选择类目</label>
          <select className="fdr-select" value={category} onChange={(e) => { setCategory(e.target.value); setProduct(""); }}>
            <option value="">请选择</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">4. 选择商品</label>
          <select className="fdr-select" value={product} onChange={(e) => setProduct(e.target.value)} disabled={!category}>
            <option value="">请选择</option>
            {products.map((p) => (
              <option key={p.id} value={`${p.title} ${p.sku}`}>{p.title}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">5. 选择渠道</label>
          <select className="fdr-select" value={channel} onChange={(e) => setChannel(e.target.value)}>
            {CHANNELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">内容形式</label>
          <select className="fdr-select" value={format} onChange={(e) => setFormat(e.target.value)}>
            {CONTENT_TYPES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field" style={{ margin: 0 }}>
          <label className="fdr-field__label">二创层级</label>
          <select className="fdr-select" value={level} onChange={(e) => setLevel(e.target.value)}>
            {REPURPOSING_LEVELS.map((l) => (
              <option key={l.key} value={l.key}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <Button variant="primary" disabled={!product} onClick={generateDirections}>生成创意方向</Button>
      </div>

      {directions.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ fontSize: 13 }}>选择创意方向</h4>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {directions.map((d) => (
              <button
                key={d}
                type="button"
                className={"fdr-btn " + (selectedDirection === d ? "fdr-btn--primary" : "fdr-btn--secondary")}
                style={{ textAlign: "left", whiteSpace: "normal", padding: "10px 12px" }}
                onClick={() => setSelectedDirection(d)}
              >
                {d}
              </button>
            ))}
          </div>
          {selectedDirection ? (
            <div style={{ marginTop: 10 }}>
              <Button variant="primary" onClick={generateScriptForDirection}>生成脚本与素材</Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {script ? (
        <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 16, marginBottom: 0 }}>
          <h4 style={{ fontSize: 13, marginTop: 0 }}>脚本草稿</h4>
          <p style={{ fontSize: 13 }}>{script}</p>
          <Button variant="primary" onClick={handleCreate}>创建二创任务（进入检查流程）</Button>
        </div>
      ) : null}
    </div>
  );
}

function TaskDetail({ task, onBack, onChange }) {
  const toast = useToast();
  const [running, setRunning] = useState(null);

  async function run(action, fn, label) {
    setRunning(action);
    await fn(task.id);
    setRunning(null);
    onChange();
    toast(`${label}完成`, "success");
  }

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回二创任务列表</button>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 4px 0" }}>{task.creativeAngle}</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>来源：{task.trendSource}</p>
          </div>
          <StatusPill tone={STATUS_TONE[task.status] ?? "neutral"}>{task.status}</StatusPill>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 14 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{getStoreName(task.storeId)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>类目 / 商品</dt><dd style={{ margin: 0 }}>{task.category} / {task.product}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>目标受众</dt><dd style={{ margin: 0 }}>{task.targetAudience}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容形式</dt><dd style={{ margin: 0 }}>{task.contentFormat}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>品牌表达</dt><dd style={{ margin: 0 }}>{task.brandExpression}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>自有素材</dt><dd style={{ margin: 0 }}>{(task.selfOwnedAssets ?? []).join("、") || "无"}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>授权状态</dt><dd style={{ margin: 0 }}>{task.authorizationStatus}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>Prompt / Skill / Knowledge</dt><dd style={{ margin: 0 }}>{task.promptVersion} · {task.skillVersion ?? "—"} · {task.knowledgeVersion ?? "—"}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>模型 / Token 成本</dt><dd style={{ margin: 0 }}>{task.model} · {task.tokenCost} tokens</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>生产成本</dt><dd style={{ margin: 0 }}>${task.productionCostUsd}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>原创度</dt><dd style={{ margin: 0 }}>{task.originalityScore ?? "未检查"}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>版权检查</dt><dd style={{ margin: 0 }}>{task.copyrightResult}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>合规检查</dt><dd style={{ margin: 0 }}>{task.complianceResult}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>审批状态</dt><dd style={{ margin: 0 }}>{task.approvalStatus}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>发布渠道</dt><dd style={{ margin: 0 }}>{(task.publishingChannels ?? []).join("、") || "未设置"}</dd></div>
        </dl>

        {task.originalityDetail ? (
          <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 12, marginBottom: 0 }}>
            <h4 style={{ fontSize: 13, marginTop: 0 }}>原创度检查详情</h4>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, fontSize: 12 }}>
              <div><dt style={{ color: "var(--text-secondary)" }}>脚本相似度</dt><dd style={{ margin: 0 }}>{task.originalityDetail.scriptSimilarity.toFixed(0)}%</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>结构相似度</dt><dd style={{ margin: 0 }}>{task.originalityDetail.structureSimilarity.toFixed(0)}%</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>画面相似度</dt><dd style={{ margin: 0 }}>{task.originalityDetail.visualSimilarity.toFixed(0)}%</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>音频相似度</dt><dd style={{ margin: 0 }}>{task.originalityDetail.audioSimilarity.toFixed(0)}%</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>对参考内容依赖度</dt><dd style={{ margin: 0 }}>{task.originalityDetail.referenceDependency}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>原创贡献度</dt><dd style={{ margin: 0 }}>{task.originalityDetail.originalContribution}</dd></div>
            </dl>
            <StatusPill tone={task.originalityDetail.result === "通过" ? "success" : task.originalityDetail.result === "建议修改" ? "warning" : "danger"}>
              {task.originalityDetail.result}
            </StatusPill>
          </div>
        ) : null}

        {task.copyrightDetail ? (
          <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 12, marginBottom: 0 }}>
            <h4 style={{ fontSize: 13, marginTop: 0 }}>版权检查详情</h4>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, fontSize: 12 }}>
              <div><dt style={{ color: "var(--text-secondary)" }}>来源授权</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.sourceAuthorization}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>音乐授权</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.musicAuthorization}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>肖像授权</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.portraitAuthorization}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>声音授权</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.voiceAuthorization}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>商标使用</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.trademarkUse}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>影视素材</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.filmMaterial}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>买家内容授权</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.buyerContentAuthorization}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>水印检测</dt><dd style={{ margin: 0 }}>{task.copyrightDetail.watermarkDetection}</dd></div>
            </dl>
            <StatusPill tone={task.copyrightDetail.result === "通过" ? "success" : "danger"}>{task.copyrightDetail.result}</StatusPill>
          </div>
        ) : null}

        {task.complianceDetail ? (
          <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 12, marginBottom: 0 }}>
            <h4 style={{ fontSize: 13, marginTop: 0 }}>平台合规检查详情（{task.complianceDetail.platform}）</h4>
            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, fontSize: 12 }}>
              <div><dt style={{ color: "var(--text-secondary)" }}>禁用词</dt><dd style={{ margin: 0 }}>{task.complianceDetail.prohibitedTerms}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>营销宣称</dt><dd style={{ margin: 0 }}>{task.complianceDetail.marketingClaims}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>价格宣称</dt><dd style={{ margin: 0 }}>{task.complianceDetail.priceClaims}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>医疗/功效宣称</dt><dd style={{ margin: 0 }}>{task.complianceDetail.medicalClaims}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>AI 内容披露</dt><dd style={{ margin: 0 }}>{task.complianceDetail.aiDisclosure}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>数字人披露</dt><dd style={{ margin: 0 }}>{task.complianceDetail.digitalHumanDisclosure}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>敏感事件</dt><dd style={{ margin: 0 }}>{task.complianceDetail.sensitiveEvents}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>未成年人相关</dt><dd style={{ margin: 0 }}>{task.complianceDetail.minorRelated}</dd></div>
              <div><dt style={{ color: "var(--text-secondary)" }}>合规分</dt><dd style={{ margin: 0 }}>{task.complianceDetail.complianceScore}</dd></div>
            </dl>
            <StatusPill tone={task.complianceDetail.result === "通过" ? "success" : "danger"}>{task.complianceDetail.result}</StatusPill>
          </div>
        ) : null}

        {task.complianceFailReason ? (
          <div className="fdr-card" style={{ background: "rgba(239,68,68,.06)", borderColor: "var(--danger)", marginTop: 12, marginBottom: 0 }}>
            <StatusPill tone="danger">合规未通过</StatusPill> <span style={{ fontSize: 12 }}>{task.complianceFailReason}</span>
          </div>
        ) : null}
        {task.publishFailReason ? (
          <div className="fdr-card" style={{ background: "rgba(239,68,68,.06)", borderColor: "var(--danger)", marginTop: 12, marginBottom: 0 }}>
            <StatusPill tone="danger">发布失败</StatusPill> <span style={{ fontSize: 12 }}>{task.publishFailReason}</span>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
          <Button variant="secondary" disabled={running === "originality"} onClick={() => run("originality", runOriginalityCheck, "原创度检查")}>
            {running === "originality" ? "检查中…" : "运行原创度检查"}
          </Button>
          <Button variant="secondary" disabled={running === "copyright"} onClick={() => run("copyright", runCopyrightCheck, "版权检查")}>
            {running === "copyright" ? "检查中…" : "运行版权检查"}
          </Button>
          <Button variant="secondary" disabled={running === "compliance"} onClick={() => run("compliance", runComplianceCheck, "合规检查")}>
            {running === "compliance" ? "检查中…" : "运行合规检查"}
          </Button>
          <Button
            variant="primary"
            disabled={task.status !== "待审批"}
            onClick={() => { submitApproval(task.id); onChange(); toast("已提交审批并加入发布计划", "success"); }}
          >
            提交审批 / 加入发布计划
          </Button>
          <Button
            variant="secondary"
            disabled={running === "publish" || !["待发布", "发布失败"].includes(task.status)}
            onClick={() => run("publish", retryMockPublishing, "模拟发布")}
          >
            {running === "publish" ? "发布中…" : "重试模拟发布"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function RepurposingWorkbench() {
  const { navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getContentState());
  const [selectedId, setSelectedId] = useState(null);
  const [view, setView] = useState("start");

  const selected = selectedId ? state.hotContentTasks.find((t) => t.id === selectedId) : null;

  if (selected) {
    return <TaskDetail task={selected} onBack={() => setSelectedId(null)} onChange={() => setState(getContentState())} />;
  }

  return (
    <div>
      <Tabs
        tabs={[{ key: "start", label: "开始新任务" }, { key: "tasks", label: `二创任务（${state.hotContentTasks.length}）` }]}
        activeTab={view}
        onChange={setView}
      />
      {view === "start" ? (
        <>
          <LevelExplainer />
          <StartWizard onCreated={() => { setState(getContentState()); setView("tasks"); }} />
        </>
      ) : (
        <div className="fdr-card">
          <DataTable
            columns={[
              { key: "creativeAngle", label: "创意方向" },
              { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
              { key: "contentFormat", label: "形式" },
              { key: "repurposingLevel", label: "层级", render: (r) => REPURPOSING_LEVELS.find((l) => l.key === r.repurposingLevel)?.label ?? "—" },
              { key: "originalityScore", label: "原创度", render: (r) => r.originalityScore ?? "—" },
              { key: "riskLevel", label: "风险" },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
            ]}
            rows={state.hotContentTasks}
            onRowClick={(row) => setSelectedId(row.id)}
            emptyMessage="暂无二创任务"
          />
        </div>
      )}
      <div style={{ marginTop: 4 }}>
        <Button variant="ghost" onClick={() => navigate("contentCenter", { subView: "calendar" })}>查看发布计划 →</Button>
      </div>
    </div>
  );
}
