import { useState } from "react";
import { getIpName, getStudioState, retryPublishTask } from "../mock/studioMock.js";
import { Card, DemoBadge, Modal, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatDateTime, formatMoney, formatNumber } from "./formatters.js";

/**
 * 矩阵账号 / 内容资产（§5.F/G）。面向经营/内容用户的文案使用"平台
 * 账号 / 账号授权 / 发布状态 / 账号健康"这类业务语言，不使用
 * "Connector"——底层代码仍可以叫 Connector，但这里是用户可见文案，
 * 按 §9 的产品语言要求处理。
 */

const HEALTH_LABEL = { healthy: "健康", attention: "需关注", at_risk: "有风险" };
const HEALTH_TONE = { healthy: "success", attention: "warning", at_risk: "danger" };
const MONETIZATION_STATUS_LABEL = { not_started: "未开始", in_progress: "进行中", monetized: "已商业化" };
const MONETIZATION_STATUS_TONE = { not_started: "neutral", in_progress: "info", monetized: "success" };
const AUTHORIZATION_LABEL = { authorized: "已授权", pending: "待授权", expired: "已过期" };
const AUTHORIZATION_TONE = { authorized: "success", pending: "warning", expired: "danger" };

export function MatrixAccountsPage() {
  const { matrixAccounts } = getStudioState();
  const [detailAccountId, setDetailAccountId] = useState(null);
  const detailAccount = matrixAccounts.find((a) => a.accountId === detailAccountId) ?? null;

  return (
    <Card title="矩阵账号（平台账号 · 账号授权 · 发布状态）" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "platform", label: "平台" },
          { key: "handle", label: "账号名称" },
          { key: "positioning", label: "账号定位" },
          { key: "ip", label: "所属 IP", render: (r) => getIpName(r.ipId) },
          { key: "followers", label: "粉丝数量", render: (r) => formatNumber(r.followers) },
          { key: "lastUpdatedAt", label: "最近更新", render: (r) => formatDateTime(r.lastUpdatedAt) },
          { key: "contentCount", label: "内容数量" },
          { key: "totalPlays", label: "播放量", render: (r) => formatNumber(r.totalPlays) },
          { key: "accountHealth", label: "风险状态", render: (r) => <Pill tone={HEALTH_TONE[r.accountHealth]}>{HEALTH_LABEL[r.accountHealth]}</Pill> },
          { key: "monetizationStatus", label: "账号状态", render: (r) => <Pill tone={MONETIZATION_STATUS_TONE[r.monetizationStatus]}>{MONETIZATION_STATUS_LABEL[r.monetizationStatus]}</Pill> },
          { key: "authorizationStatus", label: "授权状态", render: (r) => <Pill tone={AUTHORIZATION_TONE[r.authorizationStatus]}>{AUTHORIZATION_LABEL[r.authorizationStatus]}</Pill> },
          { key: "publishFrequency", label: "发布频率" },
          { key: "sellableTrafficValue", label: "可售广告资源估值", render: (r) => formatMoney(r.sellableTrafficValue) },
          { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); setDetailAccountId(r.accountId); }}>账号详情</button> },
        ]}
        rows={matrixAccounts}
        onRowClick={(r) => setDetailAccountId(r.accountId)}
      />

      <Modal open={!!detailAccount} title={detailAccount ? `账号详情 · ${detailAccount.handle}` : ""} onClose={() => setDetailAccountId(null)}>
        {detailAccount ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
            <div className="st-field-row">
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>平台</span><p style={{ margin: "2px 0 0" }}>{detailAccount.platform}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>账号定位</span><p style={{ margin: "2px 0 0" }}>{detailAccount.positioning}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>所属 IP</span><p style={{ margin: "2px 0 0" }}>{getIpName(detailAccount.ipId)}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>粉丝数量</span><p style={{ margin: "2px 0 0" }}>{formatNumber(detailAccount.followers)}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>内容数量</span><p style={{ margin: "2px 0 0" }}>{detailAccount.contentCount}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>累计播放量</span><p style={{ margin: "2px 0 0" }}>{formatNumber(detailAccount.totalPlays)}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>发布频率</span><p style={{ margin: "2px 0 0" }}>{detailAccount.publishFrequency}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>最近更新</span><p style={{ margin: "2px 0 0" }}>{formatDateTime(detailAccount.lastUpdatedAt)}</p></div>
              <div><span style={{ color: "var(--text-secondary)", fontSize: 11 }}>可售广告资源估值</span><p style={{ margin: "2px 0 0" }}>{formatMoney(detailAccount.sellableTrafficValue)}</p></div>
            </div>
            <div className="st-btn-row">
              <Pill tone={HEALTH_TONE[detailAccount.accountHealth]}>风险状态：{HEALTH_LABEL[detailAccount.accountHealth]}</Pill>
              <Pill tone={MONETIZATION_STATUS_TONE[detailAccount.monetizationStatus]}>账号状态：{MONETIZATION_STATUS_LABEL[detailAccount.monetizationStatus]}</Pill>
              <Pill tone={AUTHORIZATION_TONE[detailAccount.authorizationStatus]}>授权状态：{AUTHORIZATION_LABEL[detailAccount.authorizationStatus]}</Pill>
            </div>
          </div>
        ) : null}
      </Modal>
    </Card>
  );
}

const PUBLISH_STATUS_LABEL = { scheduled: "待发布", publishing: "发布中", published: "已发布", failed: "发布失败" };
const PUBLISH_STATUS_TONE = { scheduled: "neutral", publishing: "info", published: "success", failed: "danger" };

export function MatrixPublishPage() {
  const [state, setState] = useState(() => getStudioState());
  const [feedback, showFeedback] = useInlineFeedback();

  async function handleRetry(taskId) {
    const next = await retryPublishTask(taskId);
    setState((s) => ({ ...s, matrixPublishTasks: next.matrixPublishTasks }));
    showFeedback("已重新提交发布，数据回流已同步");
  }

  return (
    <Card title="矩阵发布" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <Table
        columns={[
          { key: "platform", label: "平台" }, { key: "accountId", label: "账号", render: (r) => state.matrixAccounts.find((a) => a.accountId === r.accountId)?.handle ?? r.accountId },
          { key: "title", label: "标题" }, { key: "abTitle", label: "A/B 标题" }, { key: "copy", label: "文案" },
          { key: "tags", label: "标签", render: (r) => r.tags.join("、") }, { key: "cover", label: "封面" },
          { key: "scheduledAt", label: "发布时间", render: (r) => formatDateTime(r.scheduledAt) },
          { key: "contentVersion", label: "内容版本" },
          { key: "reviewStatus", label: "审核状态", render: (r) => <Pill tone="success">{r.reviewStatus}</Pill> },
          { key: "status", label: "状态", render: (r) => <Pill tone={PUBLISH_STATUS_TONE[r.status]}>{PUBLISH_STATUS_LABEL[r.status]}</Pill> },
          { key: "contentUrl", label: "内容URL", render: (r) => r.contentUrl || "—" },
          { key: "dataSyncStatus", label: "数据回流", render: (r) => (r.dataSyncStatus === "synced" ? "已同步" : "待同步") },
          {
            key: "actions", label: "操作", render: (r) => (
              r.status === "failed" ? <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); handleRetry(r.taskId); }}>失败重试</button> : "—"
            ),
          },
        ]}
        rows={state.matrixPublishTasks}
      />
    </Card>
  );
}

const COPYRIGHT_LABEL = { pending: "待确认", cleared: "已清晰", licensed_out: "已对外授权", disputed: "存在争议" };
const COPYRIGHT_TONE = { pending: "warning", cleared: "success", licensed_out: "info", disputed: "danger" };
const LICENSE_LABEL = { internal_only: "仅内部使用", licensed: "已授权", open: "开放使用" };

export function ContentAssetsPage() {
  const { contentAssets } = getStudioState();
  return (
    <Card title="内容资产库" action={<DemoBadge />}>
      <Table
        columns={[
          { key: "assetId", label: "资产编号" },
          { key: "title", label: "标题" },
          { key: "assetType", label: "类型" },
          { key: "ip", label: "所属 IP", render: (r) => getIpName(r.ipId) },
          { key: "copyrightStatus", label: "版权状态", render: (r) => <Pill tone={COPYRIGHT_TONE[r.copyrightStatus]}>{COPYRIGHT_LABEL[r.copyrightStatus]}</Pill> },
          { key: "reusable", label: "可复用", render: (r) => (r.reusable ? "是" : "否") },
          { key: "generationSource", label: "生成来源" },
          { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() },
          { key: "computeCost", label: "算力成本" },
          { key: "publishedPlatforms", label: "已发布平台", render: (r) => (r.publishedPlatforms.length ? r.publishedPlatforms.join("、") : "尚未发布") },
          { key: "cumulativePlays", label: "累计播放", render: (r) => formatNumber(r.cumulativePlays) },
          { key: "cumulativeRevenue", label: "累计收入", render: (r) => formatMoney(r.cumulativeRevenue) },
          { key: "commercialLicenseStatus", label: "商业授权状态", render: (r) => LICENSE_LABEL[r.commercialLicenseStatus] },
        ]}
        rows={contentAssets}
      />
    </Card>
  );
}
