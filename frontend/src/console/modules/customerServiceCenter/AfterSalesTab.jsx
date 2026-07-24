import { useState } from "react";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { getStoreName } from "../../mock/storesMock.js";
import {
  CASE_TYPES,
  RESOLUTION_OPTIONS,
  executeMockResolution,
  generateCommunication,
  getAfterSalesState,
  selectResolution,
} from "../../mock/afterSalesMock.js";

const STATUS_TONE = {
  待受理: "neutral", AI分析中: "info", 待补充证据: "warning", 待经营者确认: "warning", 待审批: "warning",
  等待买家: "neutral", 等待物流: "neutral", 等待平台: "warning", 处理中: "info", 平台介入: "danger",
  已同意: "success", 已驳回: "danger", 已退款: "success", 已补发: "success", 已换货: "success",
  已完成: "success", 异常: "danger", 已关闭: "neutral",
};

const CASE_DETAIL_TABS = [
  { key: "ruleMatching", label: "规则匹配" },
  { key: "responsibility", label: "责任判定" },
  { key: "resolution", label: "处理方案" },
  { key: "communication", label: "平台沟通" },
  { key: "execution", label: "售后执行" },
];

function RuleMatchingTab({ case_ }) {
  return (
    <div className="fdr-card">
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
        以下规则均为演示数据，不构成真实法律或平台依据。优先级：平台强制规则 + 适用法律法规基线 &gt; 店铺政策 &gt; 类目政策 &gt; 商品专属政策 &gt; AI 建议。
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {[
          { label: "平台强制规则 + 法律法规基线", value: case_.platformRule, rank: 1 },
          { label: "店铺政策", value: case_.storeRule, rank: 2 },
          { label: "类目政策", value: case_.categoryRule, rank: 3 },
          { label: "商品专属政策", value: case_.productRule, rank: 4 },
        ].map((r) => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 10, background: "var(--bg)" }}>
            <div>
              <StatusPill tone="neutral">优先级 {r.rank}</StatusPill>{" "}
              <strong style={{ fontSize: 13 }}>{r.label}</strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>{r.value}</p>
            </div>
          </div>
        ))}
      </div>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginTop: 14 }}>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>处理时限</dt><dd style={{ margin: 0 }}>{new Date(case_.deadline).toLocaleString("zh-CN")}</dd></div>
        <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>最高赔付权限</dt><dd style={{ margin: 0 }}>${case_.maxCompensationAuthorityUsd}</dd></div>
      </dl>
    </div>
  );
}

function ResponsibilityTab({ case_ }) {
  const items = [
    { label: "商家责任", value: case_.reason.includes("质量") ? "待供应商复核" : "低" },
    { label: "买家责任", value: "低" },
    { label: "物流责任", value: case_.logisticsResponsibility },
    { label: "供应商责任", value: case_.supplierResponsibility },
    { label: "平台责任", value: "不涉及" },
  ];
  return (
    <div className="fdr-card">
      <h4 style={{ fontSize: 13, marginTop: 0 }}>责任判定Agent 分析</h4>
      <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12 }}>
        {items.map((i) => (
          <div key={i.label}><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>{i.label}</dt><dd style={{ margin: 0 }}>{i.value}</dd></div>
        ))}
      </dl>
      <div className="fdr-card" style={{ background: "var(--bg)", marginTop: 12, marginBottom: 0 }}>
        <strong style={{ fontSize: 12 }}>证据摘要</strong>
        <p style={{ fontSize: 12, margin: "4px 0 0 0" }}>买家证据：{case_.buyerEvidence || "无"}</p>
        <p style={{ fontSize: 12, margin: "4px 0 0 0" }}>商家证据：{case_.merchantEvidence || "无"}</p>
      </div>
    </div>
  );
}

function ResolutionTab({ case_, onChange }) {
  const toast = useToast();
  const [selected, setSelected] = useState(RESOLUTION_OPTIONS[0]);
  return (
    <div className="fdr-card">
      <h4 style={{ fontSize: 13, marginTop: 0 }}>方案决策Agent 建议</h4>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {RESOLUTION_OPTIONS.map((opt) => (
          <button
            key={opt}
            type="button"
            className={"fdr-btn " + (selected === opt ? "fdr-btn--primary" : "fdr-btn--secondary")}
            onClick={() => setSelected(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Button
          variant="primary"
          onClick={() => { onChange(selectResolution(case_.id, selected)); toast(`已选择处理方案：${selected}，提交审批`, "success"); }}
        >
          确认方案并提交审批
        </Button>
      </div>
    </div>
  );
}

function CommunicationTab({ case_ }) {
  const toast = useToast();
  const [comm, setComm] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    const result = await generateCommunication(case_.id);
    setComm(result);
    setLoading(false);
    toast("已生成沟通话术", "success");
  }

  return (
    <div className="fdr-card">
      <h4 style={{ fontSize: 13, marginTop: 0 }}>沟通Agent</h4>
      <Button variant="primary" disabled={loading} onClick={handleGenerate}>{loading ? "生成中…" : "生成买家沟通话术"}</Button>
      {comm ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
            <strong style={{ fontSize: 12 }}>买家回复（{comm.platform} · {comm.tone}）</strong>
            <p style={{ fontSize: 13, margin: "4px 0 0 0" }}>{comm.text}</p>
          </div>
          <div className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
            <strong style={{ fontSize: 12 }}>证据请求文本</strong>
            <p style={{ fontSize: 13, margin: "4px 0 0 0" }}>{comm.evidenceRequestText}</p>
          </div>
          <div className="fdr-card" style={{ background: "var(--bg)", marginBottom: 0 }}>
            <strong style={{ fontSize: 12 }}>平台申诉文本</strong>
            <p style={{ fontSize: 13, margin: "4px 0 0 0" }}>{comm.platformAppealText}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExecutionTab({ case_, onChange }) {
  const toast = useToast();
  const [running, setRunning] = useState(null);

  async function run(status, label) {
    setRunning(status);
    await executeMockResolution(case_.id, status);
    setRunning(null);
    onChange();
    toast(`已模拟执行：${label}`, "success");
  }

  return (
    <div className="fdr-card">
      <h4 style={{ fontSize: 13, marginTop: 0 }}>执行Agent（全部为模拟操作，不产生真实资金变动）</h4>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button variant="secondary" disabled={!!running} onClick={() => run("已同意", "批准")}>模拟批准</Button>
        <Button variant="secondary" disabled={!!running} onClick={() => run("已驳回", "驳回")}>模拟驳回</Button>
        <Button variant="secondary" disabled={!!running} onClick={() => run("已退款", "退款")}>模拟退款</Button>
        <Button variant="secondary" disabled={!!running} onClick={() => run("已补发", "补发")}>模拟补发</Button>
        <Button variant="secondary" disabled={!!running} onClick={() => run("处理中", "创建退货地址")}>模拟创建退货地址</Button>
        <Button variant="secondary" disabled={!!running} onClick={() => run("待经营者确认", "提交证据")}>模拟提交证据</Button>
      </div>
      <h4 style={{ fontSize: 13, marginTop: 16 }}>时间线</h4>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {case_.timeline.map((t, idx) => (
          <div key={idx} style={{ fontSize: 12, display: "flex", gap: 10 }}>
            <span style={{ color: "var(--text-secondary)", minWidth: 140 }}>{new Date(t.time).toLocaleString("zh-CN")}</span>
            <span>{t.actor}：{t.event}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CaseDetail({ case_, onBack, onChange }) {
  const { navigate } = useConsoleNavContext();
  const [tab, setTab] = useState("ruleMatching");

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回售后工单列表</button>
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 4px 0" }}>{case_.caseType} · {case_.product}</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              {case_.platform} · {getStoreName(case_.storeId)} · 订单 {case_.orderNumber} · 买家 {case_.buyer}
            </p>
          </div>
          <StatusPill tone={STATUS_TONE[case_.status] ?? "neutral"}>{case_.status}</StatusPill>
        </div>
        <p style={{ fontSize: 13, marginTop: 10 }}>问题描述：{case_.reason}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <Button size="sm" variant="ghost" onClick={() => navigate("orderCenter")}>查看关联订单 →</Button>
        </div>
      </div>

      <Tabs tabs={CASE_DETAIL_TABS} activeTab={tab} onChange={setTab} />
      {tab === "ruleMatching" && <RuleMatchingTab case_={case_} />}
      {tab === "responsibility" && <ResponsibilityTab case_={case_} />}
      {tab === "resolution" && <ResolutionTab case_={case_} onChange={onChange} />}
      {tab === "communication" && <CommunicationTab case_={case_} />}
      {tab === "execution" && <ExecutionTab case_={case_} onChange={onChange} />}
    </div>
  );
}

/**
 * 售后客服——完整保留原"售后中心"的售后工单能力（规则匹配 →
 * 责任判定 → 处理方案 → 平台沟通 → 售后执行），只是从独立的
 * 一级模块移动为客服中心内的一个标签页（阶段客服中心修正）。
 */
export function AfterSalesTab() {
  const [state, setState] = useState(() => getAfterSalesState());
  const [selectedId, setSelectedId] = useState(null);
  const [caseTypeFilter, setCaseTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const selected = selectedId ? state.cases.find((c) => c.id === selectedId) : null;
  const cases = state.cases.filter((c) => {
    if (caseTypeFilter && c.caseType !== caseTypeFilter) return false;
    if (statusFilter && c.status !== statusFilter) return false;
    return true;
  });

  if (selected) {
    return <CaseDetail case_={selected} onBack={() => setSelectedId(null)} onChange={() => setState(getAfterSalesState())} />;
  }

  return (
    <div>
      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select className="fdr-select" style={{ maxWidth: 180 }} value={caseTypeFilter} onChange={(e) => setCaseTypeFilter(e.target.value)}>
            <option value="">全部工单类型</option>
            {CASE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            {Object.keys(STATUS_TONE).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="fdr-card">
        <DataTable
          columns={[
            { key: "orderNumber", label: "订单号" },
            { key: "storeId", label: "店铺", render: (r) => getStoreName(r.storeId) },
            { key: "platform", label: "平台" },
            { key: "product", label: "商品" },
            { key: "caseType", label: "工单类型" },
            { key: "amount", label: "金额", render: (r) => `¥${r.amount}` },
            { key: "riskLevel", label: "风险" },
            { key: "deadline", label: "截止时间", render: (r) => new Date(r.deadline).toLocaleString("zh-CN") },
            { key: "status", label: "状态", render: (r) => <StatusPill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</StatusPill> },
          ]}
          rows={cases}
          onRowClick={(row) => setSelectedId(row.id)}
          emptyMessage="当前筛选条件下暂无工单"
        />
      </div>
    </div>
  );
}
