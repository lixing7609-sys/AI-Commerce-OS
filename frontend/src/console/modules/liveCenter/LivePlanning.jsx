import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Modal } from "../../kit/Modal.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { DEMO_STORES, getStoreName } from "../../mock/storesMock.js";
import {
  LIVE_MODES,
  createLivePlan,
  endMockLive,
  getLiveState,
  startMockLive,
} from "../../mock/liveMock.js";
import { LivePlanDetail } from "./LivePlanDetail.jsx";

const STATUS_TONE = { 待开播: "warning", 直播中: "success", 已结束: "neutral" };

function CreatePlanModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [storeId, setStoreId] = useState(DEMO_STORES[0].id);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState(LIVE_MODES[0].key);
  const [startTime, setStartTime] = useState("");
  const [gmvGoal, setGmvGoal] = useState(8000);

  function handleCreate() {
    createLivePlan({
      storeId,
      platform: DEMO_STORES.find((s) => s.id === storeId)?.platform === "douyin" ? "抖音" : DEMO_STORES.find((s) => s.id === storeId)?.platform === "taobao" ? "淘宝" : "小红书",
      account: `${getStoreName(storeId)} · 官方号`,
      title,
      mode,
      theme: title,
      startTime: startTime ? new Date(startTime).toISOString() : new Date(Date.now() + 24 * 3600000).toISOString(),
      durationMinutes: 60,
      gmvGoal: Number(gmvGoal),
      orderGoal: Math.round(Number(gmvGoal) / 120),
      trafficGoal: Number(gmvGoal) * 1.5,
      adBudget: Math.round(Number(gmvGoal) * 0.05),
      host: "待安排",
    });
    toast("直播计划已创建", "success");
    setTitle("");
    onCreated();
    onClose();
  }

  return (
    <Modal
      open={open}
      title="创建直播计划"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" disabled={!title} onClick={handleCreate}>创建</Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">店铺</label>
        <select className="fdr-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {DEMO_STORES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">直播标题</label>
        <input className="fdr-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：今晚8点防晒衣专场" />
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">直播模式</label>
        <select className="fdr-select" value={mode} onChange={(e) => setMode(e.target.value)}>
          {LIVE_MODES.map((m) => (
            <option key={m.key} value={m.key}>{m.label}{m.risk === "高" ? "（高风险，需额外审批）" : ""}</option>
          ))}
        </select>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">开播时间</label>
        <input className="fdr-input" type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">GMV 目标（¥）</label>
        <input className="fdr-input" type="number" value={gmvGoal} onChange={(e) => setGmvGoal(e.target.value)} />
      </div>
    </Modal>
  );
}

export function LivePlanning() {
  const toast = useToast();
  const { navigate } = useConsoleNavContext();
  const [state, setState] = useState(() => getLiveState());
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const selected = selectedId ? state.plans.find((p) => p.id === selectedId) : null;

  if (selected) {
    return (
      <LivePlanDetail
        plan={selected}
        onBack={() => setSelectedId(null)}
        onChange={() => setState(getLiveState())}
      />
    );
  }

  return (
    <div>
      <div className="fdr-card" style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>+ 创建直播计划</Button>
      </div>
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "title", label: "标题" },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "platform", label: "平台" },
            { key: "mode", label: "模式", render: (r) => LIVE_MODES.find((m) => m.key === r.mode)?.label ?? r.mode },
            { key: "startTime", label: "开播时间", render: (r) => new Date(r.startTime).toLocaleString("zh-CN") },
            { key: "gmvGoal", label: "GMV 目标", render: (r) => `¥${r.gmvGoal.toLocaleString()}` },
            { key: "approvalStatus", label: "审批状态" },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
            {
              key: "actions",
              label: "操作",
              render: (r) => (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                  {r.status === "待开播" ? (
                    <Button size="sm" variant="secondary" onClick={() => { setState(startMockLive(r.id)); toast("已开始模拟直播", "success"); navigate("liveCenter", { subView: "controlRoom" }); }}>开始模拟直播</Button>
                  ) : null}
                  {r.status === "直播中" ? (
                    <Button size="sm" variant="secondary" onClick={() => { setState(endMockLive(r.id)); toast("已结束模拟直播", "success"); }}>结束直播</Button>
                  ) : null}
                </div>
              ),
            },
          ]}
          rows={state.plans}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyMessage="暂无直播计划"
        />
      </div>
      <CreatePlanModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => setState(getLiveState())} />
    </div>
  );
}
