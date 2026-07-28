import { getStudioOverview, getStudioState, getIpName } from "../mock/studioMock.js";
import { Card, DemoBadge, Pill, StatGrid } from "./uiHelpers.jsx";
import { formatMoney, formatNumber } from "./formatters.js";

/**
 * Studio 秘书（阶段 M8c 三类秘书正式区分）——只负责内容 Runtime
 * 范围内的任务：内容项目/选题/脚本/图文/AI视频/AI短剧/分镜/图片/
 * 配音/剪辑/字幕/数字人/AI直播/内容审核/账号发布/矩阵账号/流量/
 * 广告资源/内容收入/内容数据复盘。不显示 Founder 研发全局、店铺
 * 订单客服等完整经营管理、Marketplace 全局审核、Release Candidate
 * 全局管理——那些分别是 Founder 总秘书和 Operator秘书的职责。
 *
 * 与 Operator 的 secretary 页面（operator-preview/pages/
 * SecretaryPage.jsx）同一个产品定位、不同的 Runtime 范围，数据完全
 * 来自 Studio 自己已有的真实 mock 仓库（studioMock.js），不是伪造。
 */
export function SecretaryPage({ navigate }) {
  const overview = getStudioOverview();
  const state = getStudioState();

  const waitingReview = state.contentProjects.filter((p) => p.status === "in_review");
  const atRiskAccounts = state.matrixAccounts.filter((a) => a.accountHealth === "at_risk");

  return (
    <div>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 20 }}>Studio 秘书</h1>
            <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
              只负责内容 Runtime——查看今天的内容生产在做什么、哪些内容等待你审核发布。
            </p>
          </div>
          <DemoBadge />
        </div>
      </Card>

      <StatGrid
        items={[
          { label: "生产中项目", value: overview.inProduction, onClick: () => navigate("contentProjects") },
          { label: "待审核内容", value: overview.pendingReview, onClick: () => navigate("contentProjects") },
          { label: "本周已发布", value: overview.weeklyPublished, onClick: () => navigate("contentProjects") },
          { label: "健康矩阵账号", value: `${overview.activeAccounts}/${overview.matrixAccountCount}`, onClick: () => navigate("matrixAccounts") },
        ]}
      />

      <Card title="等待你审核发布">
        {waitingReview.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>暂无待审核内容。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {waitingReview.map((project) => (
              <div
                key={project.projectId}
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                onClick={() => navigate("contentProjects")}
              >
                <span>{project.name}</span>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{getIpName(project.ipId)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="矩阵账号异常">
        {atRiskAccounts.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>矩阵账号健康度正常。</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {atRiskAccounts.map((account) => (
              <div key={account.accountId} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }} onClick={() => navigate("matrixAccounts")}>
                <span>{account.handle}（{account.platform}）</span>
                <Pill tone="warning">需关注</Pill>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="本月内容经营概况">
        <p style={{ fontSize: 13 }}>
          总粉丝量 {formatNumber(overview.totalFollowers)} · 本月累计流量 {formatNumber(overview.monthlyTraffic)} ·
          本月广告收入 {formatMoney(overview.monthlyAdRevenue)} · 内容分成收入 {formatMoney(overview.contentShareRevenue)}
        </p>
      </Card>
    </div>
  );
}
