import { useMemo, useState } from "react";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatCard, StatGrid } from "../../../kit/StatCard.jsx";
import { DataTable } from "../../../kit/DataTable.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Button } from "../../../kit/Button.jsx";
import { ConfirmModal, Modal } from "../../../kit/Modal.jsx";
import { EmptyState } from "../../../kit/EmptyState.jsx";
import { useToast } from "../../../kit/useToast.js";
import { DEMO_STORES } from "../../../mock/storesMock.js";
import {
  ACTION_TYPES,
  RISK_LEVELS,
  TRIGGER_TYPES,
  createAutoOpsPolicy,
  deleteAutoOpsPolicy,
  getAutoOpsState,
  togglePolicyEnabled,
  updateAutoOpsPolicy,
} from "../mock/autoOpsMock.js";

const ALL = "all";
const RISK_TONE = { L0: "neutral", L1: "success", L2: "info", L3: "warning", L4: "danger" };
const OUTCOME_LABEL = { auto_executed: "自动执行", escalated: "转人工审批", failed: "执行失败" };
const OUTCOME_TONE = { auto_executed: "success", escalated: "warning", failed: "danger" };

function riskLabel(key) {
  return RISK_LEVELS.find((r) => r.key === key)?.label ?? key;
}
function triggerLabel(key) {
  return TRIGGER_TYPES.find((t) => t.key === key)?.label ?? key;
}
function actionLabel(key) {
  return ACTION_TYPES.find((a) => a.key === key)?.label ?? key;
}

function emptyDraft() {
  return { name: "", storeId: "all", riskLevel: "L1", trigger: TRIGGER_TYPES[0].key, actions: [], enabled: true };
}

function PolicyFormModal({ open, initial, onClose, onSubmit, title }) {
  const [draft, setDraft] = useState(initial ?? emptyDraft());
  function toggleAction(key) {
    setDraft((prev) => ({ ...prev, actions: prev.actions.includes(key) ? prev.actions.filter((a) => a !== key) : [...prev.actions, key] }));
  }
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!draft.name.trim() || draft.actions.length === 0} onClick={() => onSubmit(draft)}>保存</Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">策略名称</label>
        <input className="fdr-input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="例如：低库存自动生成补货建议" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div className="fdr-field">
          <label className="fdr-field__label">适用店铺</label>
          <select className="fdr-select" value={draft.storeId} onChange={(e) => setDraft((p) => ({ ...p, storeId: e.target.value }))}>
            <option value="all">全部店铺</option>
            {DEMO_STORES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="fdr-field">
          <label className="fdr-field__label">触发条件</label>
          <select className="fdr-select" value={draft.trigger} onChange={(e) => setDraft((p) => ({ ...p, trigger: e.target.value }))}>
            {TRIGGER_TYPES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">风险等级</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {RISK_LEVELS.map((level) => (
            <label key={level.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
              <input type="radio" name="riskLevel" checked={draft.riskLevel === level.key} onChange={() => setDraft((p) => ({ ...p, riskLevel: level.key }))} style={{ marginTop: 3 }} />
              <span><strong>{level.label}</strong><br /><span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{level.description}</span></span>
            </label>
          ))}
        </div>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">触发后动作（可多选）</label>
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
    </Modal>
  );
}

export function AutoOpsPage() {
  const toast = useToast();
  const [storeId, setStoreId] = useState(ALL);
  const [state, setState] = useState(() => getAutoOpsState());
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const policies = useMemo(() => {
    const list = Array.isArray(state.policies) ? state.policies : [];
    if (storeId === ALL) return list;
    return list.filter((p) => p.storeId === ALL || p.storeId === storeId);
  }, [state, storeId]);

  const executionLog = Array.isArray(state.executionLog) ? state.executionLog : [];
  const failedRuns = executionLog.filter((r) => r.outcome === "failed");

  return (
    <div>
      <PageHeader
        title="自动经营"
        subtitle="设定哪些经营操作可以自动执行、哪些需要人工审批，按 L0-L4 风险分级"
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <DemoBadge />
            <Button variant="primary" onClick={() => setCreateOpen(true)}>+ 新建策略</Button>
          </div>
        }
      />

      <StatGrid>
        <StatCard label="启用中策略" value={policies.filter((p) => p.enabled).length} />
        <StatCard label="策略总数" value={policies.length} />
        <StatCard label="执行记录" value={executionLog.length} />
        <StatCard label="异常/失败记录" value={failedRuns.length} />
      </StatGrid>

      <div className="fdr-card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <select className="fdr-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value={ALL}>全部店铺</option>
          {DEMO_STORES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">自动化策略</h3>
        {policies.length === 0 ? (
          <EmptyState icon="☲" message="该店铺暂无自动化策略，点击右上角「新建策略」开始" />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "名称" },
              { key: "storeId", label: "适用店铺", render: (r) => (r.storeId === "all" ? "全部店铺" : DEMO_STORES.find((s) => s.id === r.storeId)?.name ?? r.storeId) },
              { key: "trigger", label: "触发条件", render: (r) => triggerLabel(r.trigger) },
              { key: "actions", label: "动作", render: (r) => (r.actions ?? []).map(actionLabel).join("、") || "—" },
              { key: "riskLevel", label: "风险等级", render: (r) => <StatusPill tone={RISK_TONE[r.riskLevel] ?? "neutral"}>{riskLabel(r.riskLevel)}</StatusPill> },
              { key: "lastRunAt", label: "最近执行", render: (r) => (r.lastRunAt ? new Date(r.lastRunAt).toLocaleString("zh-CN") : "尚未执行") },
              { key: "status", label: "状态", render: (r) => <StatusPill tone={r.enabled ? "success" : "neutral"}>{r.enabled ? "已启用" : "已停用"}</StatusPill> },
              {
                key: "op",
                label: "操作",
                render: (r) => (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <Button size="sm" variant="ghost" onClick={() => { setState(togglePolicyEnabled(r.id)); toast(r.enabled ? "已停用" : "已启用", "success"); }}>
                      {r.enabled ? "停用" : "启用"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditTarget(r)}>编辑</Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(r)}>删除</Button>
                  </div>
                ),
              },
            ]}
            rows={policies}
          />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">执行记录</h3>
        {executionLog.length === 0 ? (
          <EmptyState icon="▤" message="暂无执行记录" />
        ) : (
          <DataTable
            columns={[
              { key: "triggeredAt", label: "时间", render: (r) => new Date(r.triggeredAt).toLocaleString("zh-CN") },
              { key: "policyName", label: "策略" },
              { key: "detail", label: "详情" },
              { key: "outcome", label: "结果", render: (r) => <StatusPill tone={OUTCOME_TONE[r.outcome] ?? "neutral"}>{OUTCOME_LABEL[r.outcome] ?? r.outcome}</StatusPill> },
              { key: "errorRecovery", label: "错误恢复", render: (r) => r.errorRecovery ?? "—" },
            ]}
            rows={executionLog}
          />
        )}
      </div>

      {createOpen ? (
        <PolicyFormModal
          open={createOpen}
          title="新建自动化策略"
          onClose={() => setCreateOpen(false)}
          onSubmit={(draft) => {
            setState(createAutoOpsPolicy(draft));
            setCreateOpen(false);
            toast("策略已创建", "success");
          }}
        />
      ) : null}

      {editTarget ? (
        <PolicyFormModal
          open={!!editTarget}
          title={`编辑策略 · ${editTarget.name}`}
          initial={editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={(draft) => {
            setState(updateAutoOpsPolicy(editTarget.id, draft));
            setEditTarget(null);
            toast("策略已更新", "success");
          }}
        />
      ) : null}

      <ConfirmModal
        open={!!confirmDelete}
        title="删除自动化策略"
        message={`确认删除「${confirmDelete?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          setState(deleteAutoOpsPolicy(confirmDelete.id));
          toast("已删除", "success");
        }}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}
