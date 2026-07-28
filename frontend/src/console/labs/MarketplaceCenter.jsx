import { useMemo, useState } from "react";
import { PageHeader } from "../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../kit/StatCard.jsx";
import { DataTable } from "../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../kit/StatusPill.jsx";
import { Button } from "../kit/Button.jsx";
import { Tabs } from "../kit/Tabs.jsx";
import { Modal } from "../kit/Modal.jsx";
import { useToast } from "../kit/useToast.js";
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
 * Founder 的 Marketplace 管理中心（阶段 M8 §9/§10）——生产者/审核者/
 * 运营者/发布者/开发者管理者视角，看到全部能力包（含 draft/
 * in_review），可以审核、调整发布渠道、发新版本、回滚。数据/服务层
 * 与 Operator/Studio 的 MarketplaceBrowser 完全共用
 * shared/marketplace/marketplaceService.js，这里只是多出管理动作，
 * 不是另一套数据源。
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

export function MarketplaceCenter() {
  const [tab, setTab] = useState("packages");
  const [selectedId, setSelectedId] = useState(null);
  const [, forceRerender] = useState(0);

  const packages = useMemo(() => listAllPackagesForManagement(), [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const developers = useMemo(() => {
    const map = new Map();
    for (const p of listAllPackagesForManagement()) {
      if (!map.has(p.developer.developerId)) map.set(p.developer.developerId, { ...p.developer, packageCount: 0 });
      map.get(p.developer.developerId).packageCount += 1;
    }
    return [...map.values()];
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div>
      <PageHeader title="Marketplace 中心" subtitle="AI 能力市场管理——开发、真实验证、上架审核、定价、License、灰度与回滚" actions={<DemoBadge />} />

      <StatGrid>
        <StatCard label="能力包总数" value={stats.total} />
        <StatCard label="已上架" value={stats.approved} />
        <StatCard label="审核中" value={stats.inReview} />
        <StatCard label="第三方开发者能力包" value={stats.thirdParty} />
      </StatGrid>

      <Tabs
        tabs={[
          { key: "packages", label: "能力包列表" },
          { key: "developers", label: "开发者中心" },
        ]}
        activeTab={tab}
        onChange={setTab}
      />

      {tab === "packages" ? (
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
            { key: "actions", label: "操作", render: (r) => <Button size="sm" variant="secondary" onClick={() => setSelectedId(r.id)}>管理</Button> },
          ]}
          rows={packages}
        />
      ) : (
        <DataTable
          columns={[
            { key: "displayName", label: "开发者" },
            { key: "tier", label: "类型", render: (r) => (r.tier === "platform" ? "平台自研" : r.tier === "verified_third_party" ? "已认证第三方" : "待认证第三方") },
            { key: "contactEmail", label: "联系方式" },
            { key: "packageCount", label: "能力包数量" },
          ]}
          rows={developers}
        />
      )}

      {selectedId ? (
        <PackageDetailModal packageId={selectedId} onClose={() => setSelectedId(null)} onChanged={refresh} />
      ) : null}
    </div>
  );
}
