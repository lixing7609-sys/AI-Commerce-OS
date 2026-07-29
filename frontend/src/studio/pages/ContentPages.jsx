import { useState } from "react";
import {
  CONTENT_TYPE_LABEL,
  MONETIZATION_LABEL,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_TONE,
  getIpName,
  getStudioState,
} from "../mock/studioMock.js";
import { ProjectCreationModal } from "./ProjectCreationModal.jsx";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { formatDateTime, formatMoney } from "./formatters.js";

/* ---------------------------- 内容项目 ---------------------------- */

export function ContentProjectsPage({ navigate }) {
  const { contentProjects } = getStudioState();
  const [typeFilter, setTypeFilter] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const rows = typeFilter ? contentProjects.filter((p) => p.contentType === typeFilter) : contentProjects;

  return (
    <div>
      <Card
        title="内容项目"
        action={<span className="st-btn-row"><button type="button" className="st-btn st-btn--primary st-btn-sm" onClick={() => setCreateOpen(true)}>＋ 新建内容项目</button><DemoBadge /></span>}
      >
        <div className="st-filter-bar">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">全部类型</option>
            {Object.entries(CONTENT_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <Table
          columns={[
            { key: "name", label: "项目名称" },
            { key: "contentType", label: "内容类型", render: (r) => CONTENT_TYPE_LABEL[r.contentType] },
            { key: "ip", label: "所属 IP", render: (r) => getIpName(r.ipId) },
            { key: "stage", label: "当前阶段" },
            { key: "owner", label: "负责人/Agent", render: (r) => r.ownerAgentOrPerson },
            { key: "expectedCompleteAt", label: "预计完成", render: (r) => formatDateTime(r.expectedCompleteAt) },
            { key: "tokenUsed", label: "已用 Token", render: (r) => r.tokenUsed.toLocaleString() },
            { key: "computeUnitsUsed", label: "已用算力" },
            { key: "budget", label: "预算", render: (r) => formatMoney(r.budget) },
            { key: "status", label: "状态", render: (r) => <Pill tone={PROJECT_STATUS_TONE[r.status]}>{PROJECT_STATUS_LABEL[r.status]}</Pill> },
            { key: "monetizationModel", label: "收益模式", render: (r) => MONETIZATION_LABEL[r.monetizationModel] },
            { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); navigate("director", { projectId: r.projectId }); }}>进入导演台</button> },
          ]}
          rows={rows}
          onRowClick={(r) => navigate("director", { projectId: r.projectId })}
        />
      </Card>
      <ProjectCreationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={({ project, isGraphic }) => {
          setCreateOpen(false);
          navigate(isGraphic ? "graphicContentEditor" : "director", { projectId: project.projectId });
        }}
      />
    </div>
  );
}

/* ---------------------------- AI 短剧 ---------------------------- */

export function ShortDramaPage() {
  const { contentProjects, shortDramaDetail } = getStudioState();
  const dramaProjects = contentProjects.filter((p) => p.contentType === "shortdrama");

  return (
    <div>
      <Card title="短剧项目" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "name", label: "项目名称" },
            { key: "ip", label: "所属 IP", render: (r) => getIpName(r.ipId) },
            { key: "stage", label: "当前阶段" },
            { key: "status", label: "状态", render: (r) => <Pill tone={PROJECT_STATUS_TONE[r.status]}>{PROJECT_STATUS_LABEL[r.status]}</Pill> },
            { key: "tokenUsed", label: "已用 Token", render: (r) => r.tokenUsed.toLocaleString() },
          ]}
          rows={dramaProjects}
        />
      </Card>

      <Card title="剧本 / 角色">
        <Table
          columns={[
            { key: "name", label: "角色" },
            { key: "role", label: "定位" },
            { key: "voiceProfile", label: "配音方案" },
            { key: "status", label: "状态", render: (r) => <Pill tone={r.status === "已建模" ? "success" : "warning"}>{r.status}</Pill> },
          ]}
          rows={shortDramaDetail.characters}
        />
      </Card>

      <Card title="分镜 / 配音 / 生成 / 剪辑 / 审核 进度（EP13-16）">
        <Table
          columns={[
            { key: "episode", label: "集数", render: (r) => `第 ${r.episode} 集` },
            { key: "script", label: "剧本" },
            { key: "storyboard", label: "分镜" },
            { key: "voiceover", label: "配音" },
            { key: "videoGen", label: "视频生成" },
            { key: "editing", label: "剪辑" },
            { key: "review", label: "审核" },
          ]}
          rows={shortDramaDetail.episodes}
        />
      </Card>

      <Card title="发行 / 播放数据 / 分成收入" action={<DemoBadge />}>
        <Table
          columns={[
            { key: "platform", label: "平台" },
            { key: "plays", label: "播放量", render: (r) => r.plays.toLocaleString() },
            { key: "revenue", label: "分成收入", render: (r) => formatMoney(r.revenue) },
          ]}
          rows={shortDramaDetail.distributionData}
        />
      </Card>
    </div>
  );
}

/* ---------------------------- AI 视频 ---------------------------- */

export function AiVideoPage() {
  const { aiVideoTasks } = getStudioState();
  return (
    <Card title="AI 视频任务" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "name", label: "视频任务" },
          { key: "template", label: "视频模板" },
          { key: "stage", label: "当前进度" },
          { key: "scriptStatus", label: "脚本" },
          { key: "storyboardStatus", label: "分镜" },
          { key: "assetStatus", label: "素材" },
          { key: "generationModel", label: "生成模型" },
          { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() },
          { key: "computeCost", label: "算力成本" },
          { key: "publishPlatform", label: "发布平台" },
          { key: "performance", label: "数据表现" },
        ]}
        rows={aiVideoTasks}
      />
    </Card>
  );
}

/* ---------------------------- AI 直播 ---------------------------- */

const LIVE_STATUS_TONE = { 已排期: "neutral", 进行中: "info", 待审核: "warning", 已结束: "success" };

export function AiLivePage() {
  const { aiLiveProjects } = getStudioState();
  return (
    <Card title="AI 直播项目" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "name", label: "直播项目" },
          { key: "digitalHuman", label: "数字人" },
          { key: "script", label: "直播脚本" },
          { key: "topicOrProduct", label: "商品/主题" },
          { key: "platform", label: "直播平台" },
          { key: "sessionCount", label: "场次" },
          { key: "status", label: "当前状态", render: (r) => <Pill tone={LIVE_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
          { key: "viewers", label: "观看人数", render: (r) => r.viewers.toLocaleString() },
          { key: "traffic", label: "流量", render: (r) => r.traffic.toLocaleString() },
          { key: "revenue", label: "收入", render: (r) => formatMoney(r.revenue) },
          { key: "complianceRisk", label: "违规风险" },
        ]}
        rows={aiLiveProjects}
      />
    </Card>
  );
}
