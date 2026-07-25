import { useState } from "react";

import { usePreview } from "../helpers/previewContextCore";
import { DEMO_DATA_LABEL } from "../previewData";
import {
  approveExperiment,
  CONTENT_AGENT_ID,
  getCostIntelligenceSummary,
  getLearningCandidates,
  getReflectionReports,
  getStableVersion,
} from "../../shared/agentEvolution/evolutionMock.js";
import { EDITIONS, POLICY_KEYS, hasPolicy } from "../../shared/editionPolicy.js";
import {
  approveUpdateWindow,
  authorizeDiagnostics,
  getDeviceSummary,
  getPrivacySummary,
  revokeDiagnostics,
  setBusinessDataUpload,
} from "../helpers/deviceMock.js";

/**
 * AI 成长（阶段：三版最终定位）。
 *
 * 经营者版的这一页不是重新做一份 Agent 演化 UI，而是复用 Founder
 * 也在用的同一个 shared/agentEvolution/evolutionMock.js——经营者
 * 看到的是同一份数据的受限视图（只读反思/成本摘要，只能批准"已被
 * Founder 评测过的低风险候选"），不是另建一套演化状态机。哪些操作
 * 经营者能做，来自 shared/editionPolicy.js 的 OPERATOR_POLICY，不是
 * 这个文件里硬编码的判断。
 */

const SECTIONS = [
  { key: "growth", label: "AI 成长" },
  { key: "cost", label: "成本优化" },
  { key: "device", label: "设备与更新" },
  { key: "privacy", label: "数据与隐私" },
];

const STATUS_LABEL = {
  candidate: "待 Founder 评测", evaluating: "评测中·待批准", experimenting: "灰度实验中",
  promoted: "已采纳", rejected: "已驳回", rolledBack: "已回滚",
};

function GrowthSection({ onChange }) {
  const { showPrototypeNotice } = usePreview();
  const canApproveLowRisk = hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.EVOLUTION_CANDIDATE_APPROVE_LOW_RISK);
  const stable = getStableVersion(CONTENT_AGENT_ID);
  const reports = getReflectionReports(CONTENT_AGENT_ID);
  const candidates = getLearningCandidates(CONTENT_AGENT_ID);
  const latestReport = reports[0] ?? null;

  const accepted = candidates.filter((c) => c.status === "promoted").length;
  const rejected = candidates.filter((c) => c.status === "rejected" || c.status === "rolledBack").length;
  const underTrial = candidates.filter((c) => c.status === "evaluating" || c.status === "experimenting").length;

  function handleApprove(candidateId) {
    const result = approveExperiment(candidateId);
    if (!result.ok) {
      showPrototypeNotice(result.error);
      return;
    }
    onChange();
    showPrototypeNotice("已批准该低风险改进在本店灰度");
  }

  return (
    <div>
      <section className="op-panel">
        <div className="op-panel-heading">
          <h3>当前稳定版本</h3>
          <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
        </div>
        <dl className="op-detail-meta">
          <div><dt>版本</dt><dd>{stable ? `v${stable.version}` : "—"}</dd></div>
          <div><dt>模型路由</dt><dd>{stable?.modelRoute ?? "—"}</dd></div>
        </dl>
      </section>

      <section className="op-panel">
        <h3>最近一次学习总结</h3>
        {latestReport ? (
          <p>{latestReport.summary}</p>
        ) : (
          <p className="op-empty-inline">AI 暂无新的学习总结。</p>
        )}
      </section>

      <section className="op-metric-grid">
        <article className="op-metric-card">
          <span className="op-metric-label">灰度试验中</span>
          <strong className="op-metric-value">{underTrial}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">已采纳的改进</span>
          <strong className="op-metric-value">{accepted}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">已驳回/回滚</span>
          <strong className="op-metric-value">{rejected}</strong>
        </article>
      </section>

      <section className="op-panel">
        <h3>待我确认的改进</h3>
        {candidates.length === 0 ? (
          <div className="op-empty-state">暂无待处理的 AI 改进。</div>
        ) : (
          candidates.map((c) => (
            <article className="op-advice-card" key={c.id}>
              <p><strong>{c.affectedScope}</strong> · {STATUS_LABEL[c.status] ?? c.status}</p>
              <p className="op-advice-reason-label">{c.expectedBenefit}</p>
              <div className="op-card-actions">
                {c.status === "evaluating" && c.riskLevel === "low" && canApproveLowRisk ? (
                  <button type="button" className="op-btn" onClick={() => handleApprove(c.id)}>
                    同意在我的店铺灰度
                  </button>
                ) : c.status === "candidate" ? (
                  <span className="op-empty-inline">等待 Founder 完成评测</span>
                ) : c.status === "evaluating" ? (
                  <span className="op-empty-inline">风险等级较高，需 Founder 审批</span>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function CostSection() {
  const cost = getCostIntelligenceSummary(CONTENT_AGENT_ID);
  return (
    <div>
      <section className="op-metric-grid">
        <article className="op-metric-card">
          <span className="op-metric-label">累计 Token 消耗对应运行次数</span>
          <strong className="op-metric-value">{cost.totalRuns}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">累计模型成本</span>
          <strong className="op-metric-value">${cost.totalModelCostUsd}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">单次平均成本</span>
          <strong className="op-metric-value">${cost.avgCostPerRunUsd}</strong>
        </article>
        <article className="op-metric-card">
          <span className="op-metric-label">已生效的成本优化</span>
          <strong className="op-metric-value">{cost.promotedOptimizations}</strong>
        </article>
      </section>
      <section className="op-panel">
        <h3>质量保障说明</h3>
        <p className="op-empty-inline">
          所有成本优化都必须先在评测中确认质量不下降，才会进入灰度——AI 不会为了省 Token 牺牲内容质量。
        </p>
      </section>
    </div>
  );
}

function DeviceSection({ onChange }) {
  const { showPrototypeNotice } = usePreview();
  const canApproveOta = hasPolicy(EDITIONS.OPERATOR, POLICY_KEYS.OTA_RECEIVE);
  const device = getDeviceSummary();

  function handleApprove() {
    const result = approveUpdateWindow();
    if (!result.ok) {
      showPrototypeNotice(result.error);
      return;
    }
    onChange();
    showPrototypeNotice("已安排在下次空闲时段安装更新");
  }

  return (
    <section className="op-panel">
      <div className="op-panel-heading">
        <h3>{device.model}</h3>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </div>
      <dl className="op-detail-meta">
        <div><dt>系统版本</dt><dd>{device.systemVersion}</dd></div>
        <div><dt>Agent Runtime 版本</dt><dd>{device.agentRuntimeVersion}</dd></div>
        <div><dt>最近心跳</dt><dd>{new Date(device.lastHeartbeatAt).toLocaleString("zh-CN")}</dd></div>
        <div><dt>健康状态</dt><dd>{device.health === "healthy" ? "正常" : device.health}</dd></div>
        <div><dt>更新通道</dt><dd>{device.updateChannel === "stable" ? "稳定版" : device.updateChannel}</dd></div>
      </dl>
      {device.availableUpdate ? (
        <div className="op-card-actions">
          <span>可用更新 v{device.availableUpdate.version} · {device.availableUpdate.notes}</span>
          {device.availableUpdate.status === "ready_to_install" && canApproveOta ? (
            <button type="button" className="op-btn" onClick={handleApprove}>批准安装窗口</button>
          ) : (
            <span className="op-status-badge approved">{device.availableUpdate.status === "scheduled" ? "已安排" : device.availableUpdate.status}</span>
          )}
        </div>
      ) : (
        <p className="op-empty-inline">当前已是最新版本。</p>
      )}
    </section>
  );
}

function PrivacySection({ onChange }) {
  const { showPrototypeNotice } = usePreview();
  const privacy = getPrivacySummary();

  function toggleDiagnostics() {
    const result = privacy.diagnosticAuthorized ? revokeDiagnostics() : authorizeDiagnostics(24);
    if (!result.ok) {
      showPrototypeNotice(result.error);
      return;
    }
    onChange();
    showPrototypeNotice(privacy.diagnosticAuthorized ? "已撤回远程诊断授权" : "已授权 24 小时远程诊断");
  }

  function toggleBusinessUpload() {
    setBusinessDataUpload(!privacy.businessDataUploadEnabled);
    onChange();
    showPrototypeNotice(privacy.businessDataUploadEnabled ? "已关闭业务数据上传" : "已开启业务数据上传（仅本次演示）");
  }

  return (
    <section className="op-panel">
      <h3>本地优先与隐私边界</h3>
      <dl className="op-detail-meta">
        <div><dt>数据存放位置</dt><dd>{privacy.localFirst ? "本地优先（本 Mac mini）" : "—"}</dd></div>
        <div><dt>云端遥测范围</dt><dd>{privacy.cloudTelemetryScope}</dd></div>
        <div><dt>远程诊断授权</dt><dd>{privacy.diagnosticAuthorized ? `已授权，至 ${new Date(privacy.diagnosticExpiresAt).toLocaleString("zh-CN")}` : "未授权"}</dd></div>
        <div><dt>业务数据上传（会话/订单细节/店铺策略）</dt><dd>{privacy.businessDataUploadEnabled ? "已开启" : "默认关闭"}</dd></div>
        <div><dt>最近一次授权变更</dt><dd>{new Date(privacy.consentUpdatedAt).toLocaleString("zh-CN")}</dd></div>
      </dl>
      <div className="op-card-actions">
        <button type="button" className="op-btn" onClick={toggleDiagnostics}>
          {privacy.diagnosticAuthorized ? "撤回远程诊断授权" : "授权远程诊断（24小时）"}
        </button>
        <button type="button" className="op-btn" onClick={toggleBusinessUpload}>
          {privacy.businessDataUploadEnabled ? "关闭业务数据上传" : "开启业务数据上传"}
        </button>
      </div>
    </section>
  );
}

function AIGrowthPage() {
  const [activeSection, setActiveSection] = useState("growth");
  const [, forceRerender] = useState(0);
  const onChange = () => forceRerender((n) => n + 1);

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>AI 成长</h1>
          <p>AI 如何在你的店铺里持续变强、花了多少成本、设备状态如何、数据边界在哪——都在这一页。</p>
        </div>
      </header>

      <div className="op-tab-bar wrap">
        {SECTIONS.map((section) => (
          <button
            type="button"
            key={section.key}
            className={`op-tab-button${activeSection === section.key ? " active" : ""}`}
            onClick={() => setActiveSection(section.key)}
          >
            {section.label}
          </button>
        ))}
      </div>

      {activeSection === "growth" && <GrowthSection onChange={onChange} />}
      {activeSection === "cost" && <CostSection />}
      {activeSection === "device" && <DeviceSection onChange={onChange} />}
      {activeSection === "privacy" && <PrivacySection onChange={onChange} />}
    </div>
  );
}

export default AIGrowthPage;
