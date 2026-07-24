import { useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { ConfirmModal } from "../../kit/Modal.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES } from "../../mock/storesMock.js";
import {
  ACTION_TYPES,
  RISK_LEVELS,
  TRIGGER_TYPES,
  createCustomAutomation,
  deleteCustomAutomation,
  duplicateCustomAutomation,
  getAutomationPolicyState,
  testCustomAutomation,
  toggleCustomAutomationEnabled,
  togglePolicyEnabled,
  updatePolicyThreshold,
} from "../../mock/automationPolicyMock.js";

const CLASSIFICATION_LABEL = {
  automatic: "自动执行",
  conditional: "阈值内自动 / 超出需审批",
  requires_approval: "总是需要审批",
  prohibited: "禁止自动化",
};

const CLASSIFICATION_TONE = {
  automatic: "success",
  conditional: "info",
  requires_approval: "warning",
  prohibited: "danger",
};

const CREATE_STEPS = [
  { key: "basic", label: "1. 基本信息" },
  { key: "trigger", label: "2. 触发器与动作" },
  { key: "risk", label: "3. 风险与限额" },
];

function emptyDraft() {
  return {
    name: "",
    description: "",
    applicableStore: "全部店铺",
    applicableCategory: "",
    enabled: true,
    trigger: { type: TRIGGER_TYPES[0].key, scheduleTime: "" },
    conditions: { orderAmount: "", inventoryLevel: "", adRoi: "", adSpend: "", tokenBalance: "", riskLevel: "" },
    actions: [],
    riskLevel: "L1",
    limits: {
      dailyExecutionLimit: 10,
      singleExecutionCostLimit: 1,
      dailyTokenCostLimit: 1000,
      dailyAdLimit: 0,
      failureRetry: true,
      failureNotification: true,
      auditLog: true,
    },
  };
}

function CreateAutomationFlow({ onDone, onCancel }) {
  const toast = useToast();
  const [step, setStep] = useState("basic");
  const [draft, setDraft] = useState(emptyDraft);
  const [testing, setTesting] = useState(false);

  function patch(field, value) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }
  function patchNested(group, field, value) {
    setDraft((prev) => ({ ...prev, [group]: { ...prev[group], [field]: value } }));
  }
  function toggleAction(key) {
    setDraft((prev) => ({
      ...prev,
      actions: prev.actions.includes(key) ? prev.actions.filter((a) => a !== key) : [...prev.actions, key],
    }));
  }

  function save(status) {
    createCustomAutomation({ ...draft, status, enabled: status === "enabled" });
    toast(status === "enabled" ? "自定义自动化已创建并启用" : "已保存为草稿", "success");
    onDone();
  }

  async function handleTest() {
    setTesting(true);
    const result = await testCustomAutomation();
    setTesting(false);
    toast(result.message, "success");
  }

  return (
    <div>
      <PageHeader
        title="创建自动化"
        subtitle="补充系统自带策略之外的自定义自动化工作流"
        actions={<Button variant="ghost" onClick={onCancel}>取消</Button>}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {CREATE_STEPS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={"fdr-btn " + (step === s.key ? "fdr-btn--primary" : "fdr-btn--secondary")}
            onClick={() => setStep(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {step === "basic" ? (
        <div className="fdr-card">
          <h3 className="fdr-card__title">基本信息</h3>
          <div className="fdr-field">
            <label className="fdr-field__label">自动化名称</label>
            <input className="fdr-input" value={draft.name} onChange={(e) => patch("name", e.target.value)} placeholder="例如：低ROI广告自动暂停" />
          </div>
          <div className="fdr-field">
            <label className="fdr-field__label">描述</label>
            <textarea className="fdr-textarea" value={draft.description} onChange={(e) => patch("description", e.target.value)} placeholder="这条自动化做什么、为什么需要它" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="fdr-field">
              <label className="fdr-field__label">适用店铺</label>
              <select className="fdr-select" value={draft.applicableStore} onChange={(e) => patch("applicableStore", e.target.value)}>
                <option value="全部店铺">全部店铺</option>
                {DEMO_STORES.map((s) => (
                  <option key={s.id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="fdr-field">
              <label className="fdr-field__label">适用类目</label>
              <input className="fdr-input" value={draft.applicableCategory} onChange={(e) => patch("applicableCategory", e.target.value)} placeholder="留空表示不限类目" />
            </div>
          </div>
          <div className="fdr-field">
            <label className="fdr-field__label">启用状态</label>
            <Button size="sm" variant={draft.enabled ? "primary" : "secondary"} onClick={() => patch("enabled", !draft.enabled)}>
              {draft.enabled ? "已启用" : "已停用"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "trigger" ? (
        <div>
          <div className="fdr-card">
            <h3 className="fdr-card__title">触发器</h3>
            <div className="fdr-field">
              <label className="fdr-field__label">触发方式</label>
              <select className="fdr-select" value={draft.trigger.type} onChange={(e) => patchNested("trigger", "type", e.target.value)}>
                {TRIGGER_TYPES.map((t) => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>
            </div>
            {draft.trigger.type === "scheduled" ? (
              <div className="fdr-field">
                <label className="fdr-field__label">定时时间</label>
                <input className="fdr-input" type="time" value={draft.trigger.scheduleTime} onChange={(e) => patchNested("trigger", "scheduleTime", e.target.value)} />
              </div>
            ) : null}
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">条件（留空表示不限制）</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">订单金额 ≥</label>
                <input className="fdr-input" type="number" value={draft.conditions.orderAmount} onChange={(e) => patchNested("conditions", "orderAmount", e.target.value)} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">库存水平 ≤</label>
                <input className="fdr-input" type="number" value={draft.conditions.inventoryLevel} onChange={(e) => patchNested("conditions", "inventoryLevel", e.target.value)} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">广告 ROI ≤</label>
                <input className="fdr-input" type="number" step="0.1" value={draft.conditions.adRoi} onChange={(e) => patchNested("conditions", "adRoi", e.target.value)} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">广告花费 ≥</label>
                <input className="fdr-input" type="number" value={draft.conditions.adSpend} onChange={(e) => patchNested("conditions", "adSpend", e.target.value)} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">Token 余额 ≤</label>
                <input className="fdr-input" type="number" value={draft.conditions.tokenBalance} onChange={(e) => patchNested("conditions", "tokenBalance", e.target.value)} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">风险等级</label>
                <select className="fdr-select" value={draft.conditions.riskLevel} onChange={(e) => patchNested("conditions", "riskLevel", e.target.value)}>
                  <option value="">不限</option>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
            </div>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">动作（可多选）</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ACTION_TYPES.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className={"fdr-btn " + (draft.actions.includes(a.key) ? "fdr-btn--primary" : "fdr-btn--secondary")}
                  onClick={() => toggleAction(a.key)}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === "risk" ? (
        <div>
          <div className="fdr-card">
            <h3 className="fdr-card__title">风险与审批等级</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {RISK_LEVELS.map((level) => (
                <label
                  key={level.key}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: draft.riskLevel === level.key ? "rgba(79,70,229,.08)" : "var(--bg)",
                    cursor: "pointer",
                  }}
                >
                  <input type="radio" name="riskLevel" checked={draft.riskLevel === level.key} onChange={() => patch("riskLevel", level.key)} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{level.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>{level.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="fdr-card">
            <h3 className="fdr-card__title">执行限额</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">每日执行次数上限</label>
                <input className="fdr-input" type="number" value={draft.limits.dailyExecutionLimit} onChange={(e) => patchNested("limits", "dailyExecutionLimit", Number(e.target.value))} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">单次执行成本上限（$）</label>
                <input className="fdr-input" type="number" step="0.1" value={draft.limits.singleExecutionCostLimit} onChange={(e) => patchNested("limits", "singleExecutionCostLimit", Number(e.target.value))} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">每日 Token 成本上限</label>
                <input className="fdr-input" type="number" value={draft.limits.dailyTokenCostLimit} onChange={(e) => patchNested("limits", "dailyTokenCostLimit", Number(e.target.value))} />
              </div>
              <div className="fdr-field" style={{ margin: 0 }}>
                <label className="fdr-field__label">每日广告上限（¥）</label>
                <input className="fdr-input" type="number" value={draft.limits.dailyAdLimit} onChange={(e) => patchNested("limits", "dailyAdLimit", Number(e.target.value))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={draft.limits.failureRetry} onChange={(e) => patchNested("limits", "failureRetry", e.target.checked)} />
                失败自动重试
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={draft.limits.failureNotification} onChange={(e) => patchNested("limits", "failureNotification", e.target.checked)} />
                失败通知 Founder
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                <input type="checkbox" checked={draft.limits.auditLog} onChange={(e) => patchNested("limits", "auditLog", e.target.checked)} />
                记录审计日志
              </label>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fdr-card" style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Button variant="ghost" onClick={onCancel}>取消</Button>
        <Button variant="secondary" onClick={() => save("draft")} disabled={!draft.name}>保存草稿</Button>
        <Button variant="secondary" disabled={testing} onClick={handleTest}>{testing ? "测试中…" : "测试自动化"}</Button>
        <Button variant="primary" onClick={() => save("enabled")} disabled={!draft.name || draft.actions.length === 0}>启用自动化</Button>
      </div>
    </div>
  );
}

export function AutomationPolicyModule() {
  const toast = useToast();
  const { subView, navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getAutomationPolicyState());
  const [drafts, setDrafts] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  function saveThreshold(policyId) {
    const value = Number(drafts[policyId]);
    setState(updatePolicyThreshold(policyId, value));
    toast("阈值已更新", "success");
  }

  if (subView === "create") {
    return (
      <CreateAutomationFlow
        onCancel={() => navigate("automationPolicy")}
        onDone={() => {
          setState(getAutomationPolicyState());
          navigate("automationPolicy");
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="自动化策略中心"
        subtitle="设定哪些操作可以自动执行、哪些需要人工审批；Founder 可以补充自定义自动化"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <DemoBadge />
            <Button variant="primary" onClick={() => navigate("automationPolicy", { subView: "create" })}>+ 创建自动化</Button>
          </div>
        }
      />

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>系统自动化（不可删除）</h3>
        </div>
        {state.policies.map((policy) => (
          <div key={policy.id} style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <strong style={{ fontSize: 14 }}>{policy.name}</strong>
                <span style={{ fontSize: 12, color: "var(--text-secondary)", marginLeft: 8 }}>{policy.scope}</span>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <StatusPill tone={CLASSIFICATION_TONE[policy.classification]}>
                  {CLASSIFICATION_LABEL[policy.classification]}
                </StatusPill>
                <Button size="sm" variant={policy.enabled ? "primary" : "secondary"} onClick={() => setState(togglePolicyEnabled(policy.id))}>
                  {policy.enabled ? "已启用" : "已停用"}
                </Button>
              </div>
            </div>
            {policy.classification === "conditional" ? (
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{policy.thresholdLabel} ≤</span>
                <input
                  className="fdr-input"
                  style={{ width: 100 }}
                  type="number"
                  defaultValue={policy.thresholdValue}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [policy.id]: e.target.value }))}
                />
                <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{policy.unit} 自动执行，超出转人工审批</span>
                <Button size="sm" variant="ghost" onClick={() => saveThreshold(policy.id)}>保存</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">自定义自动化</h3>
        {state.customAutomations.length === 0 ? (
          <EmptyState icon="☲" message="尚未创建任何自定义自动化，点击右上角「创建自动化」开始" />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "名称" },
              { key: "applicableStore", label: "适用店铺" },
              { key: "trigger", label: "触发方式", render: (r) => TRIGGER_TYPES.find((t) => t.key === r.trigger.type)?.label ?? r.trigger.type },
              { key: "actions", label: "动作数", render: (r) => r.actions.length },
              { key: "riskLevel", label: "风险等级" },
              {
                key: "status",
                label: "状态",
                render: (r) => <StatusPill tone={r.enabled ? "success" : "neutral"}>{r.enabled ? "已启用" : r.status === "draft" ? "草稿" : "已停用"}</StatusPill>,
              },
              {
                key: "op",
                label: "操作",
                render: (r) => (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <Button size="sm" variant="ghost" onClick={() => setState(toggleCustomAutomationEnabled(r.id))}>{r.enabled ? "停用" : "启用"}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setState(duplicateCustomAutomation(r.id)); toast("已复制", "success"); }}>复制</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(r)}>删除</Button>
                  </div>
                ),
              },
            ]}
            rows={state.customAutomations}
          />
        )}
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>执行日志</h3>
          <Button size="sm" variant="ghost" onClick={() => navigate("approvalCenter")}>去审批中心</Button>
        </div>
        <DataTable
          columns={[
            { key: "triggeredAt", label: "时间", render: (r) => new Date(r.triggeredAt).toLocaleString("zh-CN") },
            { key: "detail", label: "详情" },
            {
              key: "outcome",
              label: "结果",
              render: (r) => (
                <StatusPill tone={r.outcome === "auto_executed" ? "success" : "warning"}>
                  {r.outcome === "auto_executed" ? "自动执行" : "转人工审批"}
                </StatusPill>
              ),
            },
          ]}
          rows={state.runLog}
        />
      </div>

      <ConfirmModal
        open={!!confirmDelete}
        title="删除自定义自动化"
        message={`确认删除「${confirmDelete?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          setState(deleteCustomAutomation(confirmDelete.id));
          toast("已删除", "success");
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
