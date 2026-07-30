import { useState } from "react";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { formatMoney } from "./formatters.js";

const TABS = [
  { key: "project", label: "文章项目" },
  { key: "research", label: "研究资料" },
  { key: "outline", label: "大纲" },
  { key: "draft", label: "初稿" },
  { key: "rewrite", label: "改写" },
  { key: "seo", label: "SEO与平台适配" },
  { key: "review", label: "审核" },
  { key: "publish", label: "发布交接" },
  { key: "versions", label: "版本" },
  { key: "sources", label: "引用来源" },
  { key: "cost", label: "成本" },
];

const ARTICLES = [
  {
    id: "art-1", title: "夏季新品加湿器选购指南", topic: "家居 · 选购指南",
    sources: 6, outlineSections: 5, wordCount: 1820, rewriteRound: 2,
    reviewStatus: "通过", platform: "小红书 / 公众号", performance: "阅读 4,200 · 收藏 380",
    seoScore: 86, targetKeywords: "加湿器选购、静音加湿器、卧室加湿器推荐",
    platformAdapt: "小红书：口语化+emoji；公众号：长段落+小标题",
    sourceList: ["中国家电研究院《2026 加湿器消费报告》", "小红书选购类爆文 3 篇拆解", "品牌官方参数对比表"],
    versions: [{ version: "v3", note: "补充静音数据对比表", updatedAt: "2 小时前" }, { version: "v2", note: "改写引言更吸睛", updatedAt: "1 天前" }, { version: "v1", note: "首版草稿", updatedAt: "2 天前" }],
    tokenCost: 12400, computeCost: 6, imageCost: 320,
  },
  {
    id: "art-2", title: "抖音小店新手起号避坑指南", topic: "商家教育",
    sources: 9, outlineSections: 7, wordCount: 2450, rewriteRound: 1,
    reviewStatus: "审核中", platform: "公众号", performance: "—",
    seoScore: 72, targetKeywords: "抖音小店起号、新手开店避坑、抖音电商入门",
    platformAdapt: "公众号：结构化清单 + 案例截图",
    sourceList: ["平台官方规则文档", "商家社群常见问题整理", "内部客服工单归纳"],
    versions: [{ version: "v2", note: "改写第二段，弱化夸张表达", updatedAt: "5 小时前" }, { version: "v1", note: "首版草稿", updatedAt: "1 天前" }],
    tokenCost: 15800, computeCost: 8, imageCost: 180,
  },
  {
    id: "art-3", title: "秋冬家居好物清单（AI 生成草稿）", topic: "家居 · 种草",
    sources: 4, outlineSections: 4, wordCount: 960, rewriteRound: 0,
    reviewStatus: "草稿", platform: "—", performance: "—",
    seoScore: 54, targetKeywords: "秋冬家居好物、家居种草清单",
    platformAdapt: "尚未适配",
    sourceList: ["内容资产库历史选品数据"],
    versions: [{ version: "v1", note: "首版草稿", updatedAt: "3 天前" }],
    tokenCost: 5200, computeCost: 2, imageCost: 0,
  },
];

const REVIEW_TONE = { 通过: "success", 审核中: "warning", 草稿: "neutral" };

/**
 * Studio Lab · AI 文章（Charter §3.4）——文章项目 / 研究资料 / 大纲 /
 * 初稿 / 改写 / SEO与平台适配 / 审核 / 发布交接 / 版本 / 引用来源 /
 * 成本。之前没有对应实现，是真正新建的页面，跟随仓库其它工作台
 * （AiVideoWorkbench 等）同样的小型本地演示数据 + Tab 模式，不接入
 * 真实生成模型或搜索引擎。
 */
export function AiArticleWorkbench() {
  const [tab, setTab] = useState("project");
  const [feedback, showFeedback] = useInlineFeedback();

  return (
    <Card title="AI 文章" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "project" ? (
        <Table
          columns={[
            { key: "title", label: "文章" }, { key: "topic", label: "选题" },
            { key: "reviewStatus", label: "状态", render: (r) => <Pill tone={REVIEW_TONE[r.reviewStatus]}>{r.reviewStatus}</Pill> },
            { key: "platform", label: "发布渠道" },
          ]}
          rows={ARTICLES}
        />
      ) : null}
      {tab === "research" ? (
        <Table columns={[{ key: "title", label: "文章" }, { key: "topic", label: "选题" }, { key: "sources", label: "已收集资料数" }]} rows={ARTICLES} />
      ) : null}
      {tab === "outline" ? (
        <Table columns={[{ key: "title", label: "文章" }, { key: "outlineSections", label: "大纲章节数" }]} rows={ARTICLES} />
      ) : null}
      {tab === "draft" ? (
        <Table columns={[{ key: "title", label: "文章" }, { key: "wordCount", label: "初稿字数" }]} rows={ARTICLES} />
      ) : null}
      {tab === "rewrite" ? (
        <Table
          columns={[
            { key: "title", label: "文章" }, { key: "rewriteRound", label: "已改写轮次" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已对「${r.title}」提交新一轮改写`)}>再次改写</button>
              ),
            },
          ]}
          rows={ARTICLES}
        />
      ) : null}
      {tab === "seo" ? (
        <Table
          columns={[
            { key: "title", label: "文章" },
            { key: "seoScore", label: "SEO 评分", render: (r) => `${r.seoScore}/100` },
            { key: "targetKeywords", label: "目标关键词" },
            { key: "platformAdapt", label: "平台适配说明" },
          ]}
          rows={ARTICLES}
        />
      ) : null}
      {tab === "review" ? (
        <Table
          columns={[
            { key: "title", label: "文章" },
            { key: "reviewStatus", label: "审核状态", render: (r) => <Pill tone={REVIEW_TONE[r.reviewStatus]}>{r.reviewStatus}</Pill> },
            {
              key: "actions", label: "操作", render: (r) => (
                <span className="st-btn-row">
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已批准「${r.title}」`)}>批准</button>
                  <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已驳回「${r.title}」`)}>驳回</button>
                </span>
              ),
            },
          ]}
          rows={ARTICLES}
        />
      ) : null}
      {tab === "publish" ? (
        <Table
          columns={[
            { key: "title", label: "文章" }, { key: "platform", label: "发布渠道" }, { key: "performance", label: "数据表现" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已将「${r.title}」交接到发布中心`)}>交接到发布中心</button>
              ),
            },
          ]}
          rows={ARTICLES}
        />
      ) : null}
      {tab === "versions" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ARTICLES.map((a) => (
            <Card key={a.id} title={a.title}>
              <Table
                columns={[{ key: "version", label: "版本" }, { key: "note", label: "变更说明" }, { key: "updatedAt", label: "更新时间" }]}
                rows={a.versions.map((v, idx) => ({ id: `${a.id}-${idx}`, ...v }))}
              />
            </Card>
          ))}
        </div>
      ) : null}
      {tab === "sources" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {ARTICLES.map((a) => (
            <Card key={a.id} title={a.title}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {a.sourceList.map((s, idx) => <li key={idx}>{s}</li>)}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}
      {tab === "cost" ? (
        <Table
          columns={[
            { key: "title", label: "文章" },
            { key: "tokenCost", label: "Token 成本", render: (r) => r.tokenCost.toLocaleString() },
            { key: "computeCost", label: "算力成本" },
            { key: "imageCost", label: "配图成本", render: (r) => formatMoney(r.imageCost) },
          ]}
          rows={ARTICLES}
        />
      ) : null}
    </Card>
  );
}
