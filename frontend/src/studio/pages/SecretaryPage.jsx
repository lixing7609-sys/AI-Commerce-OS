import { getStudioOverview, getStudioState } from "../mock/studioMock.js";
import { getHotspotState } from "../mock/hotspotMock.js";
import { getAgentStatusList } from "../mock/studioAgentMock.js";
import { getMonetizationOverview } from "../mock/monetizationMock.js";
import { DemoBadge } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatMoney, formatNumber } from "./formatters.js";

/**
 * Studio 秘书（阶段：Studio V3 Integration 严格复刻轮）——逐区复刻
 * AI-Commerce-OS-Studio-V3-High-Fidelity-Prototype.html 的 dashboard
 * 页面结构，不是自行设计的仪表盘：
 *   A. 深色经营简报 Hero（左：今日经营简报 · 右：2×2 快速经营指标）
 *   B. 五个横向 KPI 卡（今日预计曝光/待生产内容/矩阵健康账号/
 *      本月平台分成/内容经营ROI）
 *   C. 热点与 Agent 双栏（1.25fr / .75fr）
 *   D. 重点内容项目（横向项目行，非卡片瀑布流）
 * 各区域的类名（stp-hero/stp-kpis/stp-grid2/stp-hot-item/stp-agent/
 * stp-project…）与原型 CSS 的 .hero/.kpis/.grid2/.hot-item/.agent/
 * .project 一一对应，见 studioConsole.css 底部"Studio V3 高保真
 * 原型逐区复刻"注释块。
 *
 * "快速操作"创建入口（新建/从热点/从商品/从IP/短剧/视频矩阵/直播
 * 切片/图文）是上一轮既有需求保留项，原型没有这一区块，放在原型
 * 结构之后，不影响 A-D 四个区域的原型还原度。
 */

const AGENT_STATUS_LABEL = { idle: "空闲", running: "运行中", completed: "已完成", needs_attention: "需人工介入", error: "异常" };

export function SecretaryPage({ navigate }) {
  const overview = getStudioOverview();
  const state = getStudioState();
  const { hotspots } = getHotspotState();
  const agents = getAgentStatusList();
  const monetization = getMonetizationOverview();
  const [feedback, showFeedback] = useInlineFeedback();

  const waitingReview = state.contentProjects.filter((p) => p.status === "in_review");
  const atRiskAccounts = state.matrixAccounts.filter((a) => a.accountHealth === "at_risk");
  const inProductionCount = state.contentProjects.filter((p) => p.status === "in_production").length;
  const topHotspots = [...hotspots].sort((a, b) => b.heatScore - a.heatScore).slice(0, 4);
  const featuredProjects = ["proj-7", "proj-8", "proj-9", "gproj-2"]
    .map((id) => state.contentProjects.find((p) => p.projectId === id) ?? getStudioState().contentProjects.find((p) => p.projectId === id))
    .filter(Boolean);

  function goCreateFromTrend(trendId) {
    navigate("director", { openCreate: true, presetTrendId: trendId });
    showFeedback("已带上该热点资料，跳转到内容项目创建入口");
  }

  const suggestedShortVideos = topHotspots.filter((h) => h.suitableContentTypes.includes("shortvideo")).length || 3;
  const suggestedDramas = topHotspots.filter((h) => h.suitableContentTypes.includes("shortdrama")).length || 1;

  const HOTSPOT_ACTION_LABEL = ["创建项目", "开始创作", "开始创作", "生成剧本"];

  return (
    <div>
      {/* A. 深色经营简报 Hero */}
      <div className="stp-hero">
        <div className="stp-hero-top">
          <div>
            <h2>早上好，Founder。Studio 今日已进入自动经营状态。</h2>
            <p>热点 Agent 已完成全平台扫描，内容总监 Agent 已生成今日生产计划。</p>
          </div>
          <span className="stp-hero-status">系统健康 98%</span>
        </div>
        <div className="stp-secretary-grid">
          <div className="stp-brief">
            <h3>Studio秘书 · 今日经营简报</h3>
            <ul>
              <li>发现 {hotspots.length} 个可用热点，其中 {topHotspots.length} 个与家居、女性成长、AI创业高度匹配。</li>
              <li>建议生产 {suggestedShortVideos} 条短视频、{suggestedDramas} 部红果短剧、1 场直播切片矩阵。</li>
              <li>矩阵账号预计今日自然曝光 {formatNumber(overview.todayPlays)}，{atRiskAccounts.length > 0 ? `建议追加 Dou+ 预算 ¥1,500 处理 ${atRiskAccounts.length} 个异常账号` : "建议追加 Dou+ 预算 ¥1,500"}。</li>
              <li>红果短剧《重生后我接管了老板的公司》预测分成 ¥3,800～¥8,600。</li>
            </ul>
          </div>
          <div className="stp-quick">
            <button type="button" onClick={() => navigate("contentProjects")}>
              <b>{inProductionCount}</b><span>正在生产的项目</span>
            </button>
            <button type="button" onClick={() => navigate("matrixAccounts")}>
              <b>{overview.matrixAccountCount}</b><span>已接入矩阵账号</span>
            </button>
            <button type="button" onClick={() => navigate("monetizationCenter")}>
              <b>{formatMoney(monetization.totalRevenue)}</b><span>本月内容收入</span>
            </button>
            <button type="button" onClick={() => navigate("computeTasks")}>
              <b>{agents.filter((a) => a.status === "running").length}</b><span>Agent 正在工作</span>
            </button>
          </div>
        </div>
      </div>

      {/* B. 五个横向 KPI 卡 */}
      <div className="stp-kpis">
        <div className="stp-kpi"><span className="stp-label">今日预计曝光</span><strong>{formatNumber(overview.todayPlays)}</strong><span className="stp-trend">↑ 18.6%</span></div>
        <div className="stp-kpi"><span className="stp-label">待生产内容</span><strong>{overview.pendingReview + inProductionCount}</strong><span className="stp-trend">{waitingReview.length} 条待审核</span></div>
        <div className="stp-kpi"><span className="stp-label">矩阵健康账号</span><strong>{overview.activeAccounts}/{overview.matrixAccountCount}</strong><span className="stp-trend">{atRiskAccounts.length} 个需处理</span></div>
        <div className="stp-kpi"><span className="stp-label">本月平台分成</span><strong>{formatMoney(monetization.platformShareRevenue)}</strong><span className="stp-trend">↑ 26.1%</span></div>
        <div className="stp-kpi"><span className="stp-label">内容经营 ROI</span><strong>3.72</strong><span className="stp-trend">高于目标 0.72</span></div>
      </div>

      {/* C. 热点与 Agent 双栏（1.25fr / .75fr） */}
      <div className="stp-grid2">
        <div className="stp-card">
          <div className="stp-section-head">
            <h3>🔥 今日热点与 AI 选题建议</h3>
            <button type="button" className="stp-link" onClick={() => navigate("hotspotAnalysis")}>进入热点分析中心</button>
          </div>
          <div className="stp-hot-list">
            {topHotspots.map((h, idx) => (
              <div key={h.trendId} className="stp-hot-item">
                <div className="stp-rank">{String(idx + 1).padStart(2, "0")}</div>
                <div>
                  <h4>{h.name}</h4>
                  <p>{h.sourcePlatform}热度上涨 {h.growthRate}% · 适合{h.suitableForGraphic ? "图文/" : ""}{h.suitableContentTypes.includes("shortdrama") ? "短剧" : h.suitableContentTypes.includes("shortvideo") ? "短视频" : "矩阵内容"}</p>
                </div>
                <div className="stp-score">潜力 {h.heatScore}</div>
                <button type="button" className="stp-action-btn" onClick={() => goCreateFromTrend(h.trendId)}>{HOTSPOT_ACTION_LABEL[idx] ?? "创建项目"}</button>
              </div>
            ))}
          </div>
        </div>
        <div className="stp-card">
          <div className="stp-section-head">
            <h3>Agent 工作状态</h3>
            <button type="button" className="stp-link" onClick={() => navigate("computeTasks")}>查看全部</button>
          </div>
          <div className="stp-agent-list">
            {agents.slice(0, 5).map((a) => (
              <div key={a.agentId} className="stp-agent">
                <div className="stp-avatar">◆</div>
                <div>
                  <b>{a.name}</b>
                  <p>{a.currentTask}</p>
                </div>
                <span className={`stp-status${a.needsHumanIntervention ? " stp-status--attention" : ""}`}>{AGENT_STATUS_LABEL[a.status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* D. 重点内容项目（横向项目行） */}
      <div className="stp-card">
        <div className="stp-section-head">
          <h3>重点内容项目</h3>
          <button type="button" className="stp-link" onClick={() => navigate("contentProjects")}>进入项目中心</button>
        </div>
        <div className="stp-project-list">
          {featuredProjects.map((project) => {
            const isGraphic = project.projectId.startsWith("gproj");
            const progress = { "proj-7": 68, "proj-8": 42, "proj-9": 81, "gproj-2": 74 }[project.projectId] ?? 50;
            const stageLabel = { "proj-7": "剧本完成 · 视频生成中", "proj-8": "分镜确认中", "proj-9": "12 条已发布", "gproj-2": "平台适配中" }[project.projectId] ?? project.stage;
            const tags = { "proj-7": ["红果", "抖音"], "proj-8": ["抖音", "小红书"], "proj-9": ["视频号", "B站"], "gproj-2": ["小红书", "公众号"] }[project.projectId] ?? [];
            return (
              <div key={project.projectId} className="stp-project">
                <div>
                  <h4>{project.name}</h4>
                  <p>{isGraphic ? "AI图文 · " : ""}{project.contentGoal || (project.monetizationModel && !isGraphic ? "" : "")}</p>
                </div>
                <div className="stp-tags">{tags.map((t) => <span key={t} className="stp-tag">{t}</span>)}</div>
                <div>
                  <div className="stp-progress"><i style={{ width: `${progress}%` }} /></div>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-secondary)" }}>{stageLabel}</p>
                </div>
                <button type="button" className="stp-ghost" onClick={() => navigate(isGraphic ? "graphicContentEditor" : "director", { projectId: project.projectId })}>
                  {isGraphic ? "进入图文编辑器" : "进入导演台"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* 快速操作（沿用上一轮需求，附加在原型结构之后） */}
      <div className="stp-card" style={{ padding: 18 }}>
        <div className="stp-section-head" style={{ padding: "0 0 12px" }}>
          <h3>快速操作</h3>
          {feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10 }}>
          <QuickAction label="新建内容项目" onClick={() => navigate("director", { openCreate: true })} />
          <QuickAction label="从热点创建" onClick={() => navigate("hotspotAnalysis")} />
          <QuickAction label="从商品创建" onClick={() => { navigate("director", { openCreate: true, presetType: "product_seeding" }); showFeedback("已切换到商品种草创建流程"); }} />
          <QuickAction label="从 IP 创建" onClick={() => { navigate("director", { openCreate: true, presetIpId: "ip-6" }); showFeedback("已预填 AI一人公司商业观察 IP"); }} />
          <QuickAction label="创建短剧" onClick={() => navigate("director", { openCreate: true, presetType: "shortdrama" })} />
          <QuickAction label="创建视频矩阵" onClick={() => navigate("director", { openCreate: true, presetType: "matrix_content" })} />
          <QuickAction label="创建直播切片项目" onClick={() => navigate("aiLive")} />
          <QuickAction label="创建 AI图文" onClick={() => navigate("graphicContentEditor", { openCreate: true })} />
        </div>
      </div>
    </div>
  );
}

function QuickAction({ label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ textAlign: "left", padding: 14, borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer" }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>点击进入</div>
    </button>
  );
}
