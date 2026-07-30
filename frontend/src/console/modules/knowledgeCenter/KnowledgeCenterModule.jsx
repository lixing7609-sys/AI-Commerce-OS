import { useMemo, useState } from "react";
import { AssetCenterModule } from "../../kit/AssetCenterModule.jsx";
import { createAssetRepository } from "../../shared/assetDomain.js";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { SearchField } from "../../kit/SearchField.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { CapabilityScopeLifecycleBar } from "../../shared/CapabilityScopeLifecycleBar.jsx";
import { filterByScope } from "../../shared/capabilityScope.js";
import { CAPABILITY_SCOPE_OPTIONS } from "../../../demoData/capabilityDemoData.js";

const repo = createAssetRepository("founder.knowledgeCenter", () => [
  {
    name: "平台发布规则手册",
    description: "抖音/淘宝/小红书商品发布的平台规则与常见驳回原因",
    status: "published",
    tags: ["合规"],
    fields: {
      category: "平台规则",
      sourceType: "内部整理",
      docCount: 42,
      indexStatus: "已索引",
      permission: "全员可读",
      syncStatus: "已同步",
      scope: "founder",
    },
  },
  {
    name: "客服话术规范",
    description: "客服回复的语气、禁用词、升级人工的判断标准",
    status: "published",
    tags: ["客服"],
    fields: {
      category: "客服规范",
      sourceType: "内部整理",
      docCount: 18,
      indexStatus: "已索引",
      permission: "客服/销售 Agent 可读",
      syncStatus: "已同步",
      scope: "operator",
    },
  },
  {
    name: "退款政策 FAQ",
    description: "各平台退款时效与经营者需要承担的责任范围",
    status: "draft",
    tags: ["售后"],
    fields: {
      category: "政策",
      sourceType: "待补充",
      docCount: 6,
      indexStatus: "待索引",
      permission: "仅 Founder 可读",
      syncStatus: "未同步",
      scope: "founder",
    },
  },
  {
    name: "短剧行业选题库",
    description: "近半年高热度短剧题材、平台偏好与竞品分析",
    status: "published",
    tags: ["内容"],
    fields: {
      category: "行业知识",
      sourceType: "外部采购",
      docCount: 130,
      indexStatus: "已索引",
      permission: "内容 Agent 可读",
      syncStatus: "同步中",
      scope: "studio",
    },
  },
]);

const INDEX_STATUS_OPTIONS = [
  { value: "待索引", label: "待索引" },
  { value: "索引中", label: "索引中" },
  { value: "已索引", label: "已索引" },
  { value: "索引失败", label: "索引失败" },
];
const SYNC_STATUS_OPTIONS = [
  { value: "未同步", label: "未同步" },
  { value: "同步中", label: "同步中" },
  { value: "已同步", label: "已同步" },
  { value: "同步失败", label: "同步失败" },
];

const FIELD_SCHEMA = [
  { key: "scope", label: "适用范围（版本）", type: "select", default: "founder", options: CAPABILITY_SCOPE_OPTIONS.filter((o) => o.key !== "all").map((o) => ({ value: o.key, label: o.label })) },
  { key: "category", label: "分类" },
  { key: "sourceType", label: "数据来源" },
  { key: "docCount", label: "文档数量", placeholder: "例如：42" },
  { key: "indexStatus", label: "索引状态", type: "select", default: "待索引", options: INDEX_STATUS_OPTIONS },
  { key: "permission", label: "权限", placeholder: "例如：全员可读 / 仅 Founder 可读" },
  { key: "syncStatus", label: "同步状态", type: "select", default: "未同步", options: SYNC_STATUS_OPTIONS },
];

const INDEX_TONE = { 待索引: "neutral", 索引中: "info", 已索引: "success", 索引失败: "danger" };
const SYNC_TONE = { 未同步: "neutral", 同步中: "info", 已同步: "success", 同步失败: "danger" };

/** 检索测试——本地模拟结果，不接入真实向量检索。 */
function retrieveMock(query, docs) {
  if (!query.trim()) return [];
  const q = query.trim();
  return docs
    .filter((d) => d.name.includes(q) || d.description.includes(q) || (d.tags ?? []).some((t) => t.includes(q)))
    .map((d) => ({ ...d, snippet: `……与「${q}」相关的片段：${d.description}……`, matchScore: Math.round(70 + Math.random() * 25) }));
}

function RetrievalTestPanel({ docs }) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");

  const results = useMemo(() => retrieveMock(submittedQuery, docs), [submittedQuery, docs]);

  return (
    <div className="fdr-card">
      <h3 className="fdr-card__title">检索测试</h3>
      <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px 0" }}>
        本地模拟检索结果，用于验证知识库内容是否可被命中，不调用真实向量检索服务。
      </p>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <div style={{ flex: 1 }}>
          <SearchField value={query} onChange={setQuery} placeholder="输入问题或关键词，例如：退款时效" />
        </div>
        <button type="button" className="fdr-btn fdr-btn--primary" onClick={() => setSubmittedQuery(query)} disabled={!query.trim()}>
          检索
        </button>
      </div>
      {submittedQuery ? (
        results.length === 0 ? (
          <EmptyState icon="⌕" message={`没有命中「${submittedQuery}」相关的知识文档`} />
        ) : (
          <DataTable
            columns={[
              { key: "name", label: "命中文档" },
              { key: "snippet", label: "命中片段" },
              { key: "matchScore", label: "相关度", render: (r) => `${r.matchScore}%` },
            ]}
            rows={results}
          />
        )
      ) : (
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>输入关键词并点击「检索」查看模拟结果。</p>
      )}
    </div>
  );
}

/**
 * 中文框架审查版补充：适用范围（scope，即版本范围）字段 + 顶部
 * 版本范围选择器过滤、文档数量/索引状态/权限/同步状态字段，以及
 * 检索测试板块（搜索框 + 本地模拟结果）。AssetCenterModule 本身
 * 保持通用不改动。
 */
export function KnowledgeCenterModule() {
  const [scope, setScope] = useState("all");
  const docs = repo.list({});
  const scopedRepo = useMemo(
    () => ({ ...repo, list: (opts) => filterByScope(repo.list(opts), scope) }),
    [scope]
  );
  const scopedDocs = filterByScope(docs, scope);

  return (
    <div>
      <CapabilityScopeLifecycleBar scope={scope} onScopeChange={setScope} activeStage="配置" />
      <div style={{ margin: "12px 0" }}>
        <AssetCenterModule
          moduleKey="knowledgeCenter"
          title="知识中心"
          subtitle="Agent 检索用的知识文档库——文档数量、来源、索引状态、权限、同步状态、适用范围"
          repo={scopedRepo}
          fieldSchema={FIELD_SCHEMA}
          itemLabel="知识文档"
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">索引 / 同步状态概览</h3>
        <DataTable
          columns={[
            { key: "name", label: "知识文档" },
            { key: "docCount", label: "文档数量", render: (r) => r.fields?.docCount ?? "—" },
            { key: "indexStatus", label: "索引状态", render: (r) => <StatusPill tone={INDEX_TONE[r.fields?.indexStatus] ?? "neutral"}>{r.fields?.indexStatus ?? "—"}</StatusPill> },
            { key: "syncStatus", label: "同步状态", render: (r) => <StatusPill tone={SYNC_TONE[r.fields?.syncStatus] ?? "neutral"}>{r.fields?.syncStatus ?? "—"}</StatusPill> },
            { key: "permission", label: "权限", render: (r) => r.fields?.permission ?? "—" },
            { key: "updatedAt", label: "更新时间", render: (r) => new Date(r.updatedAt).toLocaleString("zh-CN") },
          ]}
          rows={scopedDocs}
          emptyMessage="该版本范围下暂无知识文档"
        />
      </div>

      <RetrievalTestPanel docs={scopedDocs} />
    </div>
  );
}
