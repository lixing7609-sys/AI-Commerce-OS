import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import { getContentState, getHotContentTaskForProject } from "../../mock/contentMock.js";

const STATUS_TONE = { 进行中: "info", 待审批: "warning", 策划中: "neutral", 已完成: "success" };

const HCT_STATUS_TONE = {
  已发布: "success", 已复盘: "success", 待审批: "warning", 待发布: "info", 发布失败: "danger",
};

/**
 * 内容项目的 Deliverable——直接内嵌展示，不需要跳到"二创工作台"
 * 另开一个页面才能看到生成结果（阶段 V4.2 架构修正：Deliverable
 * 是数据模型，归属于产生它的业务模块/业务对象，不是独立中心）。
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

function ProjectDetail({ project, onBack }) {
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
  const [state] = useState(() => getContentState());
  const [selectedId, setSelectedId] = useState(null);
  const selected = selectedId ? state.contentProjects.find((p) => p.id === selectedId) : null;

  if (selected) {
    return <ProjectDetail project={selected} onBack={() => setSelectedId(null)} />;
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
          { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
          { key: "dueAt", label: "截止时间", render: (r) => new Date(r.dueAt).toLocaleDateString("zh-CN") },
        ]}
        rows={state.contentProjects}
        onRowClick={(row) => setSelectedId(row.id)}
        emptyMessage={<EmptyState icon="▥" message="暂无内容项目" />}
      />
    </div>
  );
}
