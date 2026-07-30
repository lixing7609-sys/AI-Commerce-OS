import { useState } from "react";
import { Card, DemoBadge, Modal, Pill, Table, Tabs } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { ContentAssetsPage } from "./MatrixAssetPages.jsx";
import { MarketplaceBrowser } from "../../shared/marketplace/MarketplaceBrowser.jsx";

const TABS = [
  { key: "media", label: "素材库" },
  { key: "assets", label: "内容资产" },
  { key: "marketplace", label: "能力市场" },
];

const MEDIA_TYPE_OPTIONS = ["图片", "视频", "音频", "文档", "模板"];
const CATEGORY_OPTIONS = ["商品素材", "项目素材"];

const LICENSE_LABEL = { internal_only: "仅内部使用", licensed: "已授权", open: "开放使用" };
const LICENSE_TONE = { internal_only: "neutral", licensed: "success", open: "info" };

const MEDIA_ASSETS = [
  { id: "m-1", name: "LightOS 氛围灯场景实拍图（12张）", type: "图片", category: "商品素材", tags: ["家居", "氛围灯", "实拍"], source: "AI图片 Agent", license: "licensed", usageCount: 8, lastUsedAt: "2 小时前", usageLog: ["用于《出租屋灯光改造01》封面", "用于小红书图文《氛围灯改造指南》"] },
  { id: "m-2", name: "《重生豪门》EP12 完整剪辑", type: "视频", category: "项目素材", tags: ["短剧", "重生豪门", "成片"], source: "AI短剧生产线 v2", license: "licensed", usageCount: 3, lastUsedAt: "1 天前", usageLog: ["发布至抖音账号 @重生豪门官方", "发布至快手 重生豪门剧场"] },
  { id: "m-3", name: "静音加湿器白底图 + 参数图", type: "图片", category: "商品素材", tags: ["家居", "选购指南"], source: "AI图片 Agent", license: "open", usageCount: 5, lastUsedAt: "5 小时前", usageLog: ["用于 AI 文章《夏季新品加湿器选购指南》"] },
  { id: "m-4", name: "《重生豪门》主题曲（AI配音）", type: "音频", category: "项目素材", tags: ["短剧", "配乐"], source: "AI配音 Agent", license: "licensed", usageCount: 12, lastUsedAt: "3 小时前", usageLog: ["用于 EP03-EP12 片头", "用于抖音预告片"] },
  { id: "m-5", name: "品牌规范手册 2026", type: "文档", category: "项目素材", tags: ["品牌", "规范"], source: "人工上传", license: "internal_only", usageCount: 20, lastUsedAt: "1 周前", usageLog: ["供内容审核 Agent 校验语气", "供 AI图文改写参考"] },
  { id: "m-6", name: "小红书图文封面模板", type: "模板", category: "项目素材", tags: ["模板", "小红书"], source: "设计团队上传", license: "internal_only", usageCount: 34, lastUsedAt: "刚刚", usageLog: ["应用于《抖音小店新手起号避坑指南》封面"] },
  { id: "m-7", name: "锦程出海 EP03 数字人口播素材", type: "视频", category: "项目素材", tags: ["数字人", "出海"], source: "AI数字人 v1", license: "internal_only", usageCount: 1, lastUsedAt: "6 天前", usageLog: ["用于视频号 锦程出海笔记"] },
  { id: "m-8", name: "星辰家居商品种草脚本模板", type: "文档", category: "商品素材", tags: ["脚本", "种草"], source: "内容策划 Agent", license: "internal_only", usageCount: 6, lastUsedAt: "2 天前", usageLog: ["用于小红书笔记草稿"] },
];

function MediaLibraryTab({ showFeedback }) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [detailId, setDetailId] = useState(null);

  const rows = MEDIA_ASSETS.filter((a) => {
    if (typeFilter && a.type !== typeFilter) return false;
    if (categoryFilter && a.category !== categoryFilter) return false;
    if (query && !a.name.includes(query) && !a.tags.some((t) => t.includes(query))) return false;
    return true;
  });
  const detail = MEDIA_ASSETS.find((a) => a.id === detailId) ?? null;

  return (
    <Card
      title="素材库"
      action={<button type="button" className="st-btn st-btn--primary st-btn-sm" onClick={() => showFeedback("已打开素材上传面板（演示，未接入真实文件上传）")}>＋ 上传素材</button>}
    >
      <div className="st-filter-bar">
        <input placeholder="按名称或标签搜索…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ minWidth: 200 }} />
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">全部类型</option>
          {MEDIA_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">全部分类</option>
          {CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <Table
        columns={[
          { key: "name", label: "素材名称" },
          { key: "type", label: "类型" },
          { key: "category", label: "分类" },
          { key: "tags", label: "标签", render: (r) => r.tags.join("、") },
          { key: "source", label: "来源" },
          { key: "license", label: "授权", render: (r) => <Pill tone={LICENSE_TONE[r.license]}>{LICENSE_LABEL[r.license]}</Pill> },
          { key: "usageCount", label: "使用次数" },
          { key: "lastUsedAt", label: "最近使用" },
          { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>使用记录</button> },
        ]}
        rows={rows}
        onRowClick={(r) => setDetailId(r.id)}
        empty="没有符合筛选条件的素材"
      />

      <Modal open={!!detail} title={detail ? `使用记录 · ${detail.name}` : ""} onClose={() => setDetailId(null)}>
        {detail ? (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
            {detail.usageLog.map((log, idx) => <li key={idx}>{log}</li>)}
          </ul>
        ) : null}
      </Modal>
    </Card>
  );
}

/** Studio Lab · Asset Library (Charter §3.4). */
export function AssetLibraryPage() {
  const [tab, setTab] = useState("media");
  const [feedback, showFeedback] = useInlineFeedback();

  return (
    <div>
      <div className="st-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>素材库 —— 图片 / 视频 / 音频 / 文档 / 模板等全部生产素材的统一管理与检索入口</div>
        {feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "media" ? <MediaLibraryTab showFeedback={showFeedback} /> : null}
      {tab === "assets" ? <ContentAssetsPage /> : null}
      {tab === "marketplace" ? <MarketplaceBrowser theme="studio" /> : null}
    </div>
  );
}
