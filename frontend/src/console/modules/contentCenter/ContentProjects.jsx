import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import {
  decideContentApproval,
  enterPublishing,
  generateContentPackage,
  generateReview,
  getContentProject,
  getContentState,
  getHotContentTaskForProject,
  simulatePublish,
  submitForApproval,
} from "../../mock/contentMock.js";
import { getApprovalRequest } from "../../mock/approvalMock.js";
import { getOrder } from "../../mock/orderMock.js";
import { getConversation } from "../../mock/dailyCustomerServiceMock.js";
import {
  CONTENT_PROJECT_STAGE_TIMELINE,
  CONNECTOR_STATES,
  getConnectorStateLabel,
  getReviewSnapshotForProject,
  getStageIndexForState,
  getTrafficAttributionForProject,
} from "../../mock/operatingLoopMock.js";
import { getKnowledgeState } from "../../mock/knowledgeMock.js";

const STATUS_TONE = { 进行中: "info", 待审批: "warning", 策划中: "neutral", 已完成: "success" };

const LOOP_STATE_TONE = {
  Draft: "neutral", Planning: "neutral", Generating: "info", Generated: "info",
  "Pending Approval": "warning", "Revision Requested": "warning", Approved: "success",
  "Ready to Publish": "success", Publishing: "info", Published: "success",
  Monitoring: "info", Reviewed: "success", Failed: "danger", Archived: "neutral",
};

const HCT_STATUS_TONE = {
  已发布: "success", 已复盘: "success", 待审批: "warning", 待发布: "info", 发布失败: "danger",
};

/**
 * 内容项目的 Deliverable——直接内嵌展示，不需要跳到"二创工作台"
 * 另开一个页面才能看到生成结果（阶段 V4.2 架构修正：Deliverable
 * 是数据模型，归属于产生它的业务模块/业务对象，不是独立中心）。
 * 只用于没有 loopState 的旧演示项目——golden path 项目走下面的
 * LoopProjectDetail，展示更完整的经营闭环。
 */
function ProjectDeliverable({ task }) {
  const { navigate } = useConsoleNavContext();

  if (!task) {
    return (
      <div className="fdr-card">
        <h3 className="fdr-card__title">生成成果</h3>
        <EmptyState icon="✎" message="该项目尚未生成内容，可在二创工作台发起生产" />
      </div>
    );
  }

  return (
    <div className="fdr-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="fdr-card__title" style={{ margin: 0 }}>生成成果</h3>
        <StatusPill tone={HCT_STATUS_TONE[task.status] ?? "neutral"}>{task.status}</StatusPill>
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>生成脚本 / 创意方向</dt><dd style={{ margin: 0 }}>{task.creativeAngle}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容形式</dt><dd style={{ margin: 0 }}>{task.contentFormat}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>生成的图片/素材</dt><dd style={{ margin: 0 }}>{(task.selfOwnedAssets ?? []).join("、") || "暂无自有素材"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>生成版本数</dt><dd style={{ margin: 0 }}>{task.generatedVersions}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>原创度</dt><dd style={{ margin: 0 }}>{task.originalityScore ?? "未检查"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>版权 / 合规</dt><dd style={{ margin: 0 }}>{task.copyrightResult} · {task.complianceResult}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>审批结果</dt><dd style={{ margin: 0 }}>{task.approvalStatus}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>发布渠道</dt><dd style={{ margin: 0 }}>{(task.publishingChannels ?? []).join("、") || "未设置"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>发布结果</dt><dd style={{ margin: 0 }}>{task.publishingResult ?? "未发布"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台内容 ID</dt><dd style={{ margin: 0 }}>{task.platformContentId ?? "—"}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容 ROI</dt><dd style={{ margin: 0, fontWeight: 700 }}>{task.contentRoi ?? "暂无数据"}</dd></div>
        {task.performance ? (
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>表现数据</dt><dd style={{ margin: 0 }}>
            播放 {task.performance.views.toLocaleString()} · 商品点击 {task.performance.productClicks.toLocaleString()} · GMV ¥{task.performance.gmv.toLocaleString()}
          </dd></div>
        ) : null}
      </dl>
      <div style={{ marginTop: 12 }}>
        <button className="fdr-btn fdr-btn--ghost" onClick={() => navigate("contentCenter", { subView: "repurposing" })}>
          在二创工作台中打开完整任务 →
        </button>
      </div>
    </div>
  );
}

function StageTimeline({ loopState }) {
  const activeIndex = getStageIndexForState(loopState);
  return (
    <div className="fdr-card">
      <h3 className="fdr-card__title">经营闭环阶段</h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
        {CONTENT_PROJECT_STAGE_TIMELINE.map((stage, idx) => (
          <div key={stage.key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span
              style={{
                fontSize: 12,
                padding: "4px 10px",
                borderRadius: 999,
                fontWeight: idx === activeIndex ? 700 : 400,
                background: idx < activeIndex ? "rgba(34,197,94,.12)" : idx === activeIndex ? "rgba(79,70,229,.12)" : "var(--bg)",
                color: idx < activeIndex ? "#16A34A" : idx === activeIndex ? "var(--primary)" : "var(--text-secondary)",
                border: idx === activeIndex ? "1px solid var(--primary)" : "1px solid transparent",
              }}
            >
              {idx < activeIndex ? "✓ " : ""}{stage.label}
            </span>
            {idx < CONTENT_PROJECT_STAGE_TIMELINE.length - 1 ? <span style={{ color: "var(--text-secondary)" }}>→</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentVersionPackage({ version }) {
  return (
    <div className="fdr-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="fdr-card__title" style={{ margin: 0 }}>生成内容方案 v{version.version}</h3>
        <DemoBadge />
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 12 }}>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>标题</dt><dd style={{ margin: 0, fontWeight: 600 }}>{version.headline}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>文案</dt><dd style={{ margin: 0 }}>{version.caption}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>脚本</dt><dd style={{ margin: 0, whiteSpace: "pre-wrap", fontSize: 13 }}>{version.script}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>分镜计划</dt><dd style={{ margin: 0 }}>{version.shotPlan.join("；")}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>封面方向</dt><dd style={{ margin: 0 }}>{version.coverDirection}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>商品卖点</dt><dd style={{ margin: 0 }}>{version.sellingPoints.join(" · ")}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>行动号召（CTA）</dt><dd style={{ margin: 0 }}>{version.cta}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>渠道版本</dt><dd style={{ margin: 0 }}>
          {version.platformVariants.map((v) => `${v.platform} ${v.aspectRatio} · ${v.duration}`).join("；")}
        </dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>生成资产记录</dt><dd style={{ margin: 0 }}>{version.generatedAssetRecords.map((a) => a.name).join("、")}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>原创度</dt><dd style={{ margin: 0, fontWeight: 700 }}>{version.originalityScore}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>版权检查</dt><dd style={{ margin: 0 }}><StatusPill tone={version.copyrightResult === "通过" ? "success" : "danger"}>{version.copyrightResult}</StatusPill></dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>合规检查</dt><dd style={{ margin: 0 }}><StatusPill tone={version.complianceResult === "通过" ? "success" : "danger"}>{version.complianceResult}</StatusPill></dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>Token 消耗</dt><dd style={{ margin: 0 }}>{version.tokenCost}（{version.modelUsed}）</dd></div>
      </dl>
    </div>
  );
}

function RejectReasonModal({ open, onClose, onConfirm, mode }) {
  const [note, setNote] = useState("");
  return (
    <Modal
      open={open}
      title={mode === "rejected" ? "驳回内容" : "要求修改"}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant={mode === "rejected" ? "danger" : "primary"} disabled={!note.trim()} onClick={() => { onConfirm(note); setNote(""); }}>
            {mode === "rejected" ? "确认驳回" : "确认要求修改"}
          </Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">{mode === "rejected" ? "驳回理由（必填）" : "修改说明（必填）"}</label>
        <textarea className="fdr-textarea" style={{ minHeight: 90 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder={mode === "rejected" ? "请说明驳回原因" : "请说明需要修改的地方"} />
      </div>
    </Modal>
  );
}

/**
 * 业务复盘快照——generateReview() 产出后展示在项目详情页里，不跳转
 * 到另一个通用结果页。知识候选只列出来源于本项目、还未处理的那
 * 几条，处理入口指向 Agent 工作室的 Knowledge 资产库（复用已有
 * 架构，不新建 Knowledge Center）。
 */
function ReviewSnapshotCard({ review, project }) {
  const { navigate } = useConsoleNavContext();
  if (!review) return null;

  const candidates = getKnowledgeState().assets.filter((a) => a.sourceProjectId === project.id);
  const pendingCandidates = candidates.filter((a) => a.status === "candidate");

  return (
    <div className="fdr-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="fdr-card__title" style={{ margin: 0 }}>业务复盘</h3>
        <DemoBadge />
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12, marginTop: 12 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容目标</dt><dd style={{ margin: 0 }}>{review.contentGoal}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>审批结果</dt><dd style={{ margin: 0 }}>{review.approvalResult}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>发布结果</dt><dd style={{ margin: 0 }}>{review.publishResult}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>订单转化</dt><dd style={{ margin: 0 }}>{review.orderConversion} 单</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>归因 GMV</dt><dd style={{ margin: 0, fontWeight: 700 }}>¥{review.attributedGmv}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>Token 成本</dt><dd style={{ margin: 0 }}>{review.tokenCost}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>平台成本（演示）</dt><dd style={{ margin: 0 }}>${review.mockPlatformCostUsd}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>流量 ROI</dt><dd style={{ margin: 0, fontWeight: 700 }}>{review.trafficRoi}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>关键洞察</dt><dd style={{ margin: 0 }}>{review.keyLearning}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>建议下一步</dt><dd style={{ margin: 0 }}>{review.recommendedNextAction}</dd></div>
        <div style={{ gridColumn: "1 / -1" }}>
          <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>复盘建议</dt>
          <dd style={{ margin: 0 }}>{(review.recommendations ?? []).map((r) => `· ${r}`).join("\n")}</dd>
        </div>
      </dl>
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 13 }}>知识候选（{candidates.length}，待确认 {pendingCandidates.length}）</strong>
          <Button size="sm" variant="ghost" onClick={() => navigate("agentStudio", { subView: project.storeId })}>
            在 Agent 工作室中查看 →
          </Button>
        </div>
        {candidates.map((c) => (
          <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
            <span>{c.candidateType} · {c.name}</span>
            <StatusPill tone={c.status === "candidate" ? "warning" : c.status === "published" ? "success" : "neutral"}>
              {c.status === "candidate" ? "待确认" : c.status === "published" ? "已采纳" : "已驳回"}
            </StatusPill>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * golden path 项目详情——展示完整经营闭环：立项信息 → 阶段时间线 →
 * 生成内容方案 → 审批状态 → 发布配置/执行 → 流量归因/订单归因 →
 * 客服跟进 → 复盘。所有跨模块动作都通过 contentMock.js 的编排函数
 * 调用，成功/失败都有明确文案，从不静默失败或渲染空白。
 */
function LoopProjectDetail({ project, onBack, onChange }) {
  const { navigate } = useConsoleNavContext();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejectModal, setRejectModal] = useState(null);

  const latestVersion = project.contentVersions[project.contentVersions.length - 1] ?? null;
  const approval = project.approvalRequestId ? getApprovalRequest(project.approvalRequestId) : null;
  const order = project.orderId ? getOrder(project.orderId) : null;
  const conversation = project.conversationId ? getConversation(project.conversationId) : null;
  const traffic = getTrafficAttributionForProject(project.id);
  const review = project.reviewSnapshotId ? getReviewSnapshotForProject(project.id) : null;

  function report(result, successMessage) {
    setBusy(false);
    if (!result.ok) {
      toast(result.error, result.alreadyExists ? "warning" : "danger");
      return;
    }
    onChange();
    toast(successMessage, "success");
  }

  async function handleGenerate() {
    setBusy(true);
    const result = generateContentPackage(project.id);
    report(result, `已生成内容方案 v${result.version?.version ?? ""}`);
  }

  async function handleSubmitApproval() {
    setBusy(true);
    const result = submitForApproval(project.id);
    report(result, "已提交审批，审批中心可见");
  }

  async function handleDecision(decision, note) {
    setBusy(true);
    setRejectModal(null);
    const result = decideContentApproval(project.approvalRequestId, decision, note);
    report(result, decision === "approved" ? "已批准" : decision === "rejected" ? "已驳回" : "已要求修改");
  }

  async function handleEnterPublishing() {
    setBusy(true);
    const result = enterPublishing(project.id);
    report(result, "已进入发布准备");
  }

  async function handlePublish() {
    setBusy(true);
    const result = await simulatePublish(project.id);
    report(result, "模拟发布成功，已生成流量归因与订单");
  }

  async function handleReview() {
    setBusy(true);
    const result = generateReview(project.id);
    report(result, result.alreadyExists ? "复盘已存在" : "已生成业务复盘");
  }

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回内容项目列表</button>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
          <h3 style={{ margin: 0 }}>{project.name}</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <DemoBadge />
            <StatusPill tone={LOOP_STATE_TONE[project.loopState] ?? "neutral"}>{project.loopState}</StatusPill>
          </div>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 14 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{getStoreName(project.storeId)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>商品</dt><dd style={{ margin: 0 }}>{project.product}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>业务目标</dt><dd style={{ margin: 0 }}>{project.businessGoal}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>目标平台</dt><dd style={{ margin: 0 }}>{project.targetPlatform}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>目标受众</dt><dd style={{ margin: 0 }}>{project.targetAudience}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容类型</dt><dd style={{ margin: 0 }}>{project.contentType}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>选题来源</dt><dd style={{ margin: 0 }}>{project.sourceTrend}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>当前状态</dt><dd style={{ margin: 0, fontWeight: 600 }}>{project.loopState}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>负责 Agent</dt><dd style={{ margin: 0 }}>{project.relatedAgents.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>自动化程度</dt><dd style={{ margin: 0 }}>{project.automationLevel}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>创建时间</dt><dd style={{ margin: 0 }}>{new Date(project.createdAt).toLocaleString("zh-CN")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>最近更新</dt><dd style={{ margin: 0 }}>{new Date(project.updatedAt).toLocaleString("zh-CN")}</dd></div>
        </dl>
      </div>

      <StageTimeline loopState={project.loopState} />

      <div className="fdr-card">
        <h3 className="fdr-card__title">经营闭环动作</h3>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button variant="primary" disabled={busy} onClick={handleGenerate}>
            {latestVersion ? "重新生成内容方案" : "生成内容方案"}
          </Button>
          <Button
            variant="primary"
            disabled={busy || !latestVersion || !["Generated", "Revision Requested"].includes(project.loopState)}
            onClick={handleSubmitApproval}
          >
            提交审批
          </Button>
          {project.loopState === "Pending Approval" ? (
            <>
              <Button variant="primary" disabled={busy} onClick={() => handleDecision("approved")}>批准</Button>
              <Button variant="danger" disabled={busy} onClick={() => setRejectModal("rejected")}>驳回</Button>
              <Button variant="secondary" disabled={busy} onClick={() => setRejectModal("returned")}>要求修改</Button>
            </>
          ) : null}
          <Button variant="primary" disabled={busy || project.loopState !== "Approved"} onClick={handleEnterPublishing}>
            进入发布
          </Button>
          <Button variant="primary" disabled={busy || project.loopState !== "Ready to Publish"} onClick={handlePublish}>
            模拟发布
          </Button>
          <Button
            variant="secondary"
            disabled={busy || !["Published", "Monitoring"].includes(project.loopState) || !project.orderId || !project.conversationId}
            onClick={handleReview}
          >
            生成复盘
          </Button>
        </div>
        {project.loopState === "Draft" || project.loopState === "Planning" ? (
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>提示：点击「生成内容方案」开始经营闭环。</p>
        ) : null}
        {project.loopState === "Revision Requested" ? (
          <p style={{ fontSize: 12, color: "var(--danger)", marginTop: 10 }}>
            {project.rejectionReason ? `已驳回：${project.rejectionReason}` : project.revisionNote ? `要求修改：${project.revisionNote}` : "需要修改后重新生成内容方案"}
          </p>
        ) : null}
        {project.loopState === "Published" || project.loopState === "Monitoring" ? (
          !project.orderId || !project.conversationId ? (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 10 }}>订单归因/客服跟进生成中，稍后即可生成复盘。</p>
          ) : null
        ) : null}
      </div>

      {latestVersion ? <ContentVersionPackage version={latestVersion} /> : (
        <div className="fdr-card">
          <EmptyState icon="✎" message="尚未生成内容版本——点击上方「生成内容方案」开始" />
        </div>
      )}

      <div className="fdr-card">
        <h3 className="fdr-card__title">审批 / 发布 / 归因状态</h3>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>审批状态</dt>
            <dd style={{ margin: 0 }}>
              {approval ? (
                <>
                  <StatusPill tone={approval.status === "approved" ? "success" : approval.status === "pending" ? "warning" : "danger"}>{approval.status}</StatusPill>{" "}
                  <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={() => navigate("approvalCenter", { entityId: approval.id })}>在审批中心中打开 →</button>
                </>
              ) : "尚未提交审批"}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>发布状态</dt>
            <dd style={{ margin: 0 }}>{project.publishedAt ? `已发布 · ${new Date(project.publishedAt).toLocaleString("zh-CN")}` : "尚未发布"}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>连接器状态（演示）</dt>
            <dd style={{ margin: 0 }}>{getConnectorStateLabel(CONNECTOR_STATES[1])}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>流量表现</dt>
            <dd style={{ margin: 0 }}>{traffic ? `播放 ${traffic.views.toLocaleString()} · 商品点击 ${traffic.productClicks.toLocaleString()}` : "尚未产生流量数据"}</dd>
          </div>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>订单归因</dt>
            <dd style={{ margin: 0 }}>
              {order ? (
                <>
                  {order.orderNumber} · ¥{order.amount}{" "}
                  <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={() => navigate("orderCenter", { entityId: order.id })}>在订单中心中打开 →</button>
                </>
              ) : "尚未产生归因订单"}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>客服跟进</dt>
            <dd style={{ margin: 0 }}>
              {conversation ? (
                <>
                  {conversation.customer} · {conversation.status}{" "}
                  <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={() => navigate("customerServiceCenter", { subView: "daily", entityId: conversation.id })}>在客服中心中打开 →</button>
                </>
              ) : "尚未产生客服会话"}
            </dd>
          </div>
          <div>
            <dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>完整执行链</dt>
            <dd style={{ margin: 0 }}>
              <button className="fdr-btn fdr-btn--ghost fdr-btn--sm" onClick={() => navigate("replayCenter", { subView: "loop", entityId: project.replayRunId })}>在回放中心中查看 →</button>
            </dd>
          </div>
        </dl>
      </div>

      <ReviewSnapshotCard review={review} project={project} />

      <RejectReasonModal
        open={!!rejectModal}
        mode={rejectModal}
        onClose={() => setRejectModal(null)}
        onConfirm={(note) => handleDecision(rejectModal, note)}
      />
    </div>
  );
}

function LegacyProjectDetail({ project, onBack }) {
  const task = getHotContentTaskForProject(project.name);
  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回内容项目列表</button>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <h3 style={{ margin: 0 }}>{project.name}</h3>
          <StatusPill tone={STATUS_TONE[project.status] ?? "neutral"}>{project.status}</StatusPill>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 14 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>来源</dt><dd style={{ margin: 0 }}>{project.source}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺</dt><dd style={{ margin: 0 }}>{getStoreName(project.storeId)}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>类目</dt><dd style={{ margin: 0 }}>{project.category}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>商品</dt><dd style={{ margin: 0 }}>{project.product}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>营销目标</dt><dd style={{ margin: 0 }}>{project.marketingGoal}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>目标受众</dt><dd style={{ margin: 0 }}>{project.targetAudience}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容主题</dt><dd style={{ margin: 0 }}>{project.contentTheme}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容形式</dt><dd style={{ margin: 0 }}>{project.contentFormats.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>发布渠道</dt><dd style={{ margin: 0 }}>{project.plannedChannels.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>关联 Agent</dt><dd style={{ margin: 0 }}>{project.relatedAgents.join("、")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>负责人</dt><dd style={{ margin: 0 }}>{project.contentOwner}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>成本上限</dt><dd style={{ margin: 0 }}>${project.costCeilingUsd}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>创建时间</dt><dd style={{ margin: 0 }}>{new Date(project.createdAt).toLocaleString("zh-CN")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>截止时间</dt><dd style={{ margin: 0 }}>{new Date(project.dueAt).toLocaleString("zh-CN")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>预期结果</dt><dd style={{ margin: 0 }}>{project.expectedResult}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>实际结果</dt><dd style={{ margin: 0 }}>{project.actualResult ?? "进行中，暂无数据"}</dd></div>
        </dl>
      </div>
      <ProjectDeliverable task={task} />
    </div>
  );
}

export function ContentProjects() {
  const { entityId, navigate } = useConsoleNavContext();
  const [, forceRerender] = useState(0);
  const state = getContentState();

  if (entityId) {
    const project = getContentProject(entityId) ?? state.contentProjects.find((p) => p.id === entityId);
    if (!project) {
      return (
        <div className="fdr-card">
          <EmptyState
            icon="⚠"
            message="未找到该内容项目（链接可能已失效）"
            action={<Button variant="secondary" onClick={() => navigate("contentCenter", { subView: "projects" })}>返回内容项目列表</Button>}
          />
        </div>
      );
    }
    const onBack = () => navigate("contentCenter", { subView: "projects" });
    const onChange = () => forceRerender((n) => n + 1);
    return project.loopState ? (
      <LoopProjectDetail project={getContentProject(project.id)} onBack={onBack} onChange={onChange} />
    ) : (
      <LegacyProjectDetail project={project} onBack={onBack} />
    );
  }

  return (
    <div className="fdr-card">
      <DataTable
        columns={[
          { key: "name", label: "项目名称" },
          { key: "source", label: "来源" },
          { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
          { key: "category", label: "类目" },
          { key: "contentTheme", label: "内容主题" },
          { key: "plannedChannels", label: "渠道", render: (r) => r.plannedChannels.join("、") },
          {
            key: "status",
            label: "状态",
            render: (r) =>
              r.loopState ? (
                <StatusPill tone={LOOP_STATE_TONE[r.loopState] ?? "neutral"}>{r.loopState}</StatusPill>
              ) : (
                <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill>
              ),
          },
          { key: "dueAt", label: "截止时间", render: (r) => (r.dueAt ? new Date(r.dueAt).toLocaleDateString("zh-CN") : "—") },
        ]}
        rows={state.contentProjects}
        onRowClick={(row) => navigate("contentCenter", { subView: "projects", entityId: row.id })}
        emptyMessage={<EmptyState icon="▥" message="暂无内容项目" />}
      />
    </div>
  );
}
