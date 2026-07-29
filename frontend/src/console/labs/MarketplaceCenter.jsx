import { useMemo, useState } from "react";
import { PageHeader } from "../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../kit/StatCard.jsx";
import { DataTable } from "../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../kit/StatusPill.jsx";
import { Button } from "../kit/Button.jsx";
import { Modal } from "../kit/Modal.jsx";
import { EmptyState } from "../kit/EmptyState.jsx";
import { useToast } from "../kit/useToast.js";
import { useConsoleNavContext } from "../nav/ConsoleNavContext.jsx";
import { MARKETPLACE_SUBNAV } from "../nav/navConfig.js";

const SUBNAV_STATUS_BADGE = { planned: "规划中", cloudMock: "Cloud Mock" };
import {
  listAllPackagesForManagement,
  getPackage,
  setReviewState,
  setReleaseChannel,
  publishNewVersion,
  rollbackToVersion,
} from "../../shared/marketplace/marketplaceService.js";
import { ReviewState, ReleaseChannel } from "../../shared/marketplace/types.js";

/**
 * Founder 的 Marketplace 中心（阶段 M8c §4B/§5）——**云端 Marketplace
 * 的 Founder 管理/发布入口**，不是本地完整市场服务。权威的
 * Capability Package 主数据、开发者入驻、支付、结算等本应部署在
 * Operator Cloud（见 shared/marketplace/cloudMarketplaceMockApi.js
 * 顶部说明）——本组件只是这个云端服务的一个客户端管理视图，当前
 * 阶段该云端服务还没有真实后端，所以数据来自本地的 Cloud Mock
 * （localStorage 模拟，不代表真实云端状态，也不是每台 Mac mini 各自
 * 安装一套市场数据库）。
 *
 * 子导航（`MARKETPLACE_SUBNAV`，见 nav/navConfig.js）由 Founder 侧边
 * 栏的手风琴渲染，这里只根据 Founder 自己的 `subView` 导航状态渲染
 * 对应内容——不再维护一套内部 Tabs 状态，和 Operator/Studio 实验室
 * 同一个"侧边栏即导航真源"的原则（见 shell/ConsoleSidebar.jsx）。
 */

const STATUS_LABEL = {
  [ReviewState.DRAFT]: "草稿",
  [ReviewState.SUBMITTED]: "已提交",
  [ReviewState.IN_REVIEW]: "审核中",
  [ReviewState.APPROVED]: "已通过",
  [ReviewState.REJECTED]: "已驳回",
};
const STATUS_TONE = {
  [ReviewState.DRAFT]: "neutral",
  [ReviewState.SUBMITTED]: "info",
  [ReviewState.IN_REVIEW]: "warning",
  [ReviewState.APPROVED]: "success",
  [ReviewState.REJECTED]: "danger",
};

const PRICING_MODEL_LABEL = {
  free: "免费",
  one_time: "一次性付费",
  subscription: "订阅",
  usage_based: "按用量计费",
};

function PackageDetailModal({ packageId, onClose, onChanged }) {
  const toast = useToast();
  const [versionDraft, setVersionDraft] = useState("");
  const [changelogDraft, setChangelogDraft] = useState("");
  const pkg = packageId ? getPackage(packageId) : null;
  if (!pkg) return null;

  async function handleReview(nextStatus) {
    await setReviewState(pkg.id, nextStatus);
    toast(`已将「${pkg.name}」标记为${STATUS_LABEL[nextStatus]}`, "success");
    onChanged();
  }

  async function handleChannel(channel) {
    await setReleaseChannel(pkg.id, channel);
    toast(`「${pkg.name}」发布渠道已切换为 ${channel}`, "success");
    onChanged();
  }

  async function handlePublish() {
    if (!versionDraft.trim()) return;
    await publishNewVersion(pkg.id, { version: versionDraft.trim(), changelog: changelogDraft.trim() || "无更新说明" });
    toast(`已发布新版本 ${versionDraft.trim()}`, "success");
    setVersionDraft("");
    setChangelogDraft("");
    onChanged();
  }

  async function handleRollback(version) {
    await rollbackToVersion(pkg.id, version);
    toast(`已回滚到版本 ${version}`, "success");
    onChanged();
  }

  return (
    <Modal open={!!packageId} title={pkg.name} onClose={onClose}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
        <StatusPill tone={STATUS_TONE[pkg.status]}>{STATUS_LABEL[pkg.status]}</StatusPill>
        <span style={{ fontSize: 12, opacity: 0.6 }}>{pkg.packageType} · targetProducts: {pkg.targetProducts.join(", ")}</span>
        <DemoBadge />
      </div>
      <p style={{ fontSize: 13 }}>{pkg.description}</p>

      <h4 style={{ fontSize: 13, marginBottom: 6 }}>上架审核</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <Button size="sm" variant="secondary" onClick={() => handleReview(ReviewState.SUBMITTED)}>标记为已提交</Button>
        <Button size="sm" variant="secondary" onClick={() => handleReview(ReviewState.IN_REVIEW)}>转入审核</Button>
        <Button size="sm" variant="primary" onClick={() => handleReview(ReviewState.APPROVED)}>通过审核</Button>
        <Button size="sm" variant="danger" onClick={() => handleReview(ReviewState.REJECTED)}>驳回</Button>
      </div>

      <h4 style={{ fontSize: 13, marginBottom: 6 }}>发布渠道（灰度）</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {Object.values(ReleaseChannel).map((channel) => (
          <Button key={channel} size="sm" variant={pkg.releaseChannel === channel ? "primary" : "secondary"} onClick={() => handleChannel(channel)}>
            {channel}
          </Button>
        ))}
      </div>

      <h4 style={{ fontSize: 13, marginBottom: 6 }}>版本管理（当前 {pkg.currentVersion}）</h4>
      <DataTable
        columns={[
          { key: "version", label: "版本" },
          { key: "releaseChannel", label: "渠道" },
          { key: "changelog", label: "更新说明" },
          { key: "publishedAt", label: "发布时间", render: (r) => new Date(r.publishedAt).toLocaleString("zh-CN") },
          {
            key: "actions",
            label: "操作",
            render: (r) => (r.isCurrent ? <span style={{ fontSize: 12, opacity: 0.6 }}>当前版本</span> : <Button size="sm" variant="ghost" onClick={() => handleRollback(r.version)}>回滚到此版本</Button>),
          },
        ]}
        rows={pkg.versions}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <input placeholder="新版本号，如 1.1.0" value={versionDraft} onChange={(e) => setVersionDraft(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,.15)" }} />
        <input placeholder="更新说明" value={changelogDraft} onChange={(e) => setChangelogDraft(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,.15)", flex: 1, minWidth: 160 }} />
        <Button size="sm" variant="primary" disabled={!versionDraft.trim()} onClick={handlePublish}>发布新版本</Button>
      </div>

      <h4 style={{ fontSize: 13, margin: "16px 0 6px" }}>真实验证摘要</h4>
      <p style={{ fontSize: 13 }}>
        {pkg.evaluationSummary.evaluationScore == null
          ? "尚未运行 Evaluation。"
          : `Evaluation 评分 ${pkg.evaluationSummary.evaluationScore}，已验证场景：${pkg.evaluationSummary.verifiedScenarios.join("、") || "无"}。`}
        {" "}已在 {pkg.evaluationSummary.verifiedStoreCount} 家真实店铺 / {pkg.evaluationSummary.verifiedContentProjectCount} 个内容项目验证过。
      </p>

      <h4 style={{ fontSize: 13, margin: "16px 0 6px" }}>开发者</h4>
      <p style={{ fontSize: 13 }}>{pkg.developer.displayName} · {pkg.developer.tier} · {pkg.developer.contactEmail}</p>
    </Modal>
  );
}

function PackagesTable({ packages, onManage }) {
  return (
    <DataTable
      columns={[
        { key: "name", label: "名称" },
        { key: "packageType", label: "类型" },
        { key: "targetProducts", label: "面向产品端", render: (r) => r.targetProducts.join(", ") },
        { key: "status", label: "评审状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> },
        { key: "releaseChannel", label: "发布渠道" },
        { key: "currentVersion", label: "版本" },
        { key: "installCount", label: "安装数" },
        { key: "developer", label: "开发者", render: (r) => r.developer.displayName },
        { key: "actions", label: "操作", render: (r) => <Button size="sm" variant="secondary" onClick={() => onManage(r.id)}>管理</Button> },
      ]}
      rows={packages}
    />
  );
}

function PlannedNotice({ title, description }) {
  return (
    <EmptyState
      icon="◔"
      message={`${title} · 规划中——${description}`}
    />
  );
}

function CloudConsoleNotice() {
  return (
    <div className="fdr-card">
      <StatusPill tone="warning">Cloud Mock</StatusPill>
      <p style={{ fontSize: 13, marginTop: 8 }}>
        Cloud Marketplace 控制台尚未接入真实 Operator Cloud 后端——权威的 Capability Package
        主数据、开发者入驻、支付与结算按架构应该运行在 Operator Cloud，本地 Founder Mac mini
        只是这个云端服务的管理客户端。当前所有能力包数据来自本地 localStorage 模拟的
        <strong> Cloud Marketplace Mock API</strong>（见
        <code> shared/marketplace/cloudMarketplaceMockApi.js</code>），不代表任何真实云端状态，
        也不会执行真实支付、安装或开发者结算。
      </p>
      <Button variant="secondary" disabled title="尚未接入真实 Operator Cloud 后端">
        打开云端管理控制台（尚未接入）
      </Button>
    </div>
  );
}

export function MarketplaceCenter() {
  const { subView, navigate } = useConsoleNavContext();
  const activeTab = subView && MARKETPLACE_SUBNAV.some((item) => item.key === subView) ? subView : "overview";
  const [selectedId, setSelectedId] = useState(null);
  const [, forceRerender] = useState(0);

  const packages = useMemo(() => listAllPackagesForManagement(), [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const developers = useMemo(() => {
    const map = new Map();
    for (const p of listAllPackagesForManagement()) {
      if (!map.has(p.developer.developerId)) map.set(p.developer.developerId, { ...p.developer, packageCount: 0 });
      map.get(p.developer.developerId).packageCount += 1;
    }
    return [...map.values()];
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const total = packages.length;
    const approved = packages.filter((p) => p.status === ReviewState.APPROVED).length;
    const inReview = packages.filter((p) => p.status === ReviewState.IN_REVIEW || p.status === ReviewState.SUBMITTED).length;
    const thirdParty = packages.filter((p) => p.developer.tier !== "platform").length;
    return { total, approved, inReview, thirdParty };
  }, [packages]);

  function refresh() {
    forceRerender((n) => n + 1);
  }

  function manage(id) {
    setSelectedId(id);
  }

  let body;
  if (activeTab === "overview") {
    body = (
      <>
        <StatGrid>
          <StatCard label="能力包总数" value={stats.total} onClick={() => navigate("marketplaceCenter", { subView: "myPackages" })} />
          <StatCard label="已上架" value={stats.approved} />
          <StatCard label="审核中" value={stats.inReview} onClick={() => navigate("marketplaceCenter", { subView: "review" })} />
          <StatCard label="第三方开发者能力包" value={stats.thirdParty} onClick={() => navigate("marketplaceCenter", { subView: "developers" })} />
        </StatGrid>
        <div className="fdr-card">
          <p style={{ fontSize: 13 }}>
            这里是云端 Marketplace 的 Founder 管理入口——创建能力包、组合依赖、真实验证
            （Evaluation/Replay）、定价、License、发布、灰度、回滚、开发者审核，全部围绕同一份
            Cloud Mock 数据。真实结算与真实开发者身份审核需要 Operator Cloud 的真实后端，本阶段
            尚未接入，见"Cloud Marketplace 控制台"。
          </p>
        </div>
      </>
    );
  } else if (activeTab === "myPackages") {
    body = <PackagesTable packages={packages} onManage={manage} />;
  } else if (activeTab === "review") {
    const pending = packages.filter((p) => p.status === ReviewState.SUBMITTED || p.status === ReviewState.IN_REVIEW);
    body = pending.length > 0 ? <PackagesTable packages={pending} onManage={manage} /> : <EmptyState icon="☑" message="当前没有待审核的能力包" />;
  } else if (activeTab === "releaseCandidate") {
    body = <PlannedNotice title="Release Candidate 提交" description="从产品研发中心的 Release Candidate 直接生成 Marketplace 候选能力包的打通流程尚未实现，目前需要在能力包详情里手动创建/发布新版本。" />;
  } else if (activeTab === "versionsGray") {
    body = (
      <DataTable
        columns={[
          { key: "name", label: "能力包" },
          { key: "currentVersion", label: "当前版本" },
          { key: "releaseChannel", label: "发布渠道（灰度）" },
          { key: "versionCount", label: "历史版本数", render: (r) => r.versions.length },
          { key: "actions", label: "操作", render: (r) => <Button size="sm" variant="secondary" onClick={() => manage(r.id)}>管理版本</Button> },
        ]}
        rows={packages}
      />
    );
  } else if (activeTab === "pricingLicense") {
    body = (
      <DataTable
        columns={[
          { key: "name", label: "能力包" },
          { key: "pricingModel", label: "定价模式", render: (r) => `${PRICING_MODEL_LABEL[r.pricingModel.model] ?? r.pricingModel.model}${r.pricingModel.priceRmb ? ` · ¥${r.pricingModel.priceRmb}` : ""}` },
          { key: "licenseScope", label: "License 范围", render: (r) => r.licensePolicy.scope },
          { key: "tokenPolicy", label: "Token 计费", render: (r) => (r.tokenPolicy.consumesToken ? `约 ${r.tokenPolicy.estimatedTokenPerRun ?? "—"} token/次` : "不消耗 Token") },
        ]}
        rows={packages}
      />
    );
  } else if (activeTab === "salesDownloads") {
    body = (
      <DataTable
        columns={[
          { key: "name", label: "能力包" },
          { key: "installCount", label: "安装数" },
          { key: "rating", label: "评分", render: (r) => r.rating ?? "暂无评价" },
          { key: "targetProducts", label: "面向产品端", render: (r) => r.targetProducts.join(", ") },
        ]}
        rows={[...packages].sort((a, b) => b.installCount - a.installCount)}
      />
    );
  } else if (activeTab === "developers") {
    body = (
      <DataTable
        columns={[
          { key: "displayName", label: "开发者" },
          { key: "tier", label: "类型", render: (r) => (r.tier === "platform" ? "平台自研" : r.tier === "verified_third_party" ? "已认证第三方" : "待认证第三方") },
          { key: "contactEmail", label: "联系方式" },
          { key: "packageCount", label: "能力包数量" },
        ]}
        rows={developers}
      />
    );
  } else if (activeTab === "settlement") {
    body = <PlannedNotice title="分成与结算" description="开发者收益分成与真实结算需要 Operator Cloud 的支付/结算后端，本阶段不实现真实支付。" />;
  } else if (activeTab === "cloudConsole") {
    body = <CloudConsoleNotice />;
  }

  return (
    <div>
      <PageHeader
        title="Marketplace 中心"
        subtitle="云端 Marketplace 的 Founder 管理/发布入口——权威数据归属 Operator Cloud，本地为 Cloud Mock"
        actions={<DemoBadge />}
      />

      <div className="fdr-tabs" style={{ marginBottom: 16 }}>
        {MARKETPLACE_SUBNAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={"fdr-tabs__item" + (activeTab === item.key ? " fdr-tabs__item--active" : "")}
            onClick={() => navigate("marketplaceCenter", { subView: item.key })}
          >
            {item.label}
            {SUBNAV_STATUS_BADGE[item.status] ? (
              <span className="fdr-sidebar__badge" style={{ marginLeft: 6 }}>{SUBNAV_STATUS_BADGE[item.status]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {body}

      {selectedId ? (
        <PackageDetailModal packageId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      ) : null}
    </div>
  );
}
