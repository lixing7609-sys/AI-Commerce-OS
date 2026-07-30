import { useState } from "react";
import { Card, DemoBadge, Pill, Table } from "./uiHelpers.jsx";

const TABS = [
  { key: "research", label: "Research" },
  { key: "outline", label: "Outline" },
  { key: "draft", label: "Draft" },
  { key: "rewrite", label: "Rewrite" },
  { key: "review", label: "Review" },
  { key: "publish", label: "Publish" },
];

const ARTICLES = [
  {
    id: "art-1", title: "夏季新品加湿器选购指南", topic: "家居 · 选购指南",
    sources: 6, outlineSections: 5, wordCount: 1820, rewriteRound: 2,
    reviewStatus: "通过", platform: "小红书 / 公众号", performance: "阅读 4,200 · 收藏 380",
  },
  {
    id: "art-2", title: "抖音小店新手起号避坑指南", topic: "商家教育",
    sources: 9, outlineSections: 7, wordCount: 2450, rewriteRound: 1,
    reviewStatus: "审核中", platform: "公众号", performance: "—",
  },
  {
    id: "art-3", title: "秋冬家居好物清单（AI 生成草稿）", topic: "家居 · 种草",
    sources: 4, outlineSections: 4, wordCount: 960, rewriteRound: 0,
    reviewStatus: "草稿", platform: "—", performance: "—",
  },
];

const REVIEW_TONE = { 通过: "success", 审核中: "warning", 草稿: "neutral" };

/**
 * Studio Lab · AI Article (Charter §3.4) — fully net new: Research→
 * Outline→Draft→Rewrite→Review→Publish. No prior implementation
 * existed (closest was 图文/AI Image, a different content type);
 * built as its own pipeline over a small realistic article-project
 * mock, following the same tab-per-stage pattern as the other five
 * AI-type workbenches.
 */
export function AiArticleWorkbench() {
  const [tab, setTab] = useState("research");

  return (
    <Card title="AI 图文长文" action={<DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

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
        <Table columns={[{ key: "title", label: "文章" }, { key: "rewriteRound", label: "已改写轮次" }]} rows={ARTICLES} />
      ) : null}
      {tab === "review" ? (
        <Table
          columns={[
            { key: "title", label: "文章" },
            { key: "reviewStatus", label: "审核状态", render: (r) => <Pill tone={REVIEW_TONE[r.reviewStatus]}>{r.reviewStatus}</Pill> },
          ]}
          rows={ARTICLES}
        />
      ) : null}
      {tab === "publish" ? (
        <Table columns={[{ key: "title", label: "文章" }, { key: "platform", label: "发布渠道" }, { key: "performance", label: "数据表现" }]} rows={ARTICLES} />
      ) : null}
    </Card>
  );
}
