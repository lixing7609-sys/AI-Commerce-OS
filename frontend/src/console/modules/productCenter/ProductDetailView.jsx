import { useState } from "react";
import { Tabs } from "../../kit/Tabs.jsx";
import { Button } from "../../kit/Button.jsx";
import { StatusPill, DemoBadge } from "../../kit/StatusPill.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import {
  PUBLISH_PLATFORMS,
  generateAiContent,
  getProductStatusLabel,
  getPublishStatusLabel,
  markProductReady,
  publishProductToPlatform,
  updateProductField,
} from "../../mock/productMock.js";
import { getStoreName } from "../../mock/storesMock.js";

const TABS = [
  { key: "overview", label: "概览" },
  { key: "pricing", label: "定价与成本" },
  { key: "inventory", label: "库存" },
  { key: "listing", label: "发布" },
  { key: "aiContent", label: "AI 内容" },
];

const STATUS_TONE = { active: "success", draft: "neutral", out_of_stock: "danger" };

const PUBLISH_STATUS_TONE = {
  not_configured: "neutral",
  draft: "neutral",
  ready: "info",
  publishing: "warning",
  published: "success",
  failed: "danger",
};

function AiContentTab({ product, onChange }) {
  const toast = useToast();
  const [generating, setGenerating] = useState(false);
  const [aiView, setAiView] = useState("summary"); // summary | detail | history

  async function handleGenerate() {
    setGenerating(true);
    onChange(await generateAiContent(product.id));
    setGenerating(false);
    setAiView("summary");
    toast("AI 详情文案已生成", "success");
  }

  // 状态 A：从未生成过——只显示"生成"入口，不能让 Founder 误以为
  // 已经有内容存在。
  if (!product.aiContent) {
    return (
      <div className="fdr-card">
        <EmptyState icon="✎" message="AI 尚未为这个商品生成详情内容" />
        <Button variant="primary" disabled={generating} onClick={handleGenerate}>
          {generating ? "生成中…" : "生成 AI 内容"}
        </Button>
      </div>
    );
  }

  // 查看历史版本——AI 曾经生成过的所有内容永久可查看，绝不因为
  // 重新生成而丢失/隐藏旧版本。
  if (aiView === "history") {
    return (
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>历史生成版本</h3>
          <Button size="sm" variant="ghost" onClick={() => setAiView("summary")}>← 返回</Button>
        </div>
        {product.aiContentHistory.map((entry) => (
          <div key={entry.version} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <strong style={{ fontSize: 13 }}>v{entry.version} · {entry.title}</strong>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                {new Date(entry.generatedAt).toLocaleString("zh-CN")} · {entry.generatedBy}
              </span>
            </div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0 0" }}>{entry.description}</p>
          </div>
        ))}
      </div>
    );
  }

  // 查看完整内容——Founder 必须能随时看到 AI 生成的完整详情文案，
  // 不能只看到元信息。
  if (aiView === "detail") {
    return (
      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>AI 生成内容（v{product.aiContent.version}）</h3>
          <Button size="sm" variant="ghost" onClick={() => setAiView("summary")}>← 返回</Button>
        </div>
        <h4 style={{ marginBottom: 6 }}>{product.aiContent.title}</h4>
        <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{product.aiContent.description}</p>
      </div>
    );
  }

  // 状态 B：已生成——明确展示生成时间/生成方/版本，并提供 查看 /
  // 重新生成 / 历史 三个动作，Founder 一眼就能判断"这个商品的 AI
  // 内容是否已经存在"，不需要猜。
  return (
    <div className="fdr-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <StatusPill tone="success">已生成</StatusPill>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 10, marginTop: 12 }}>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>生成时间</dt><dd style={{ margin: 0 }}>{new Date(product.aiContent.generatedAt).toLocaleString("zh-CN")}</dd></div>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>生成方</dt><dd style={{ margin: 0 }}>{product.aiContent.generatedBy}</dd></div>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>版本</dt><dd style={{ margin: 0 }}>v{product.aiContent.version}</dd></div>
          </dl>
        </div>
        <DemoBadge />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <Button variant="primary" onClick={() => setAiView("detail")}>查看</Button>
        <Button variant="secondary" disabled={generating} onClick={handleGenerate}>
          {generating ? "生成中…" : "重新生成"}
        </Button>
        <Button variant="ghost" onClick={() => setAiView("history")}>历史（{product.aiContentHistory.length}）</Button>
      </div>
    </div>
  );
}

function ListingTab({ product, onChange }) {
  const toast = useToast();
  const [platform, setPlatform] = useState(PUBLISH_PLATFORMS[0].key);
  const [publishing, setPublishing] = useState(null);

  async function handlePublish(platformKey) {
    setPublishing(platformKey);
    const updatedProducts = await publishProductToPlatform(product.id, platformKey);
    onChange(updatedProducts);
    setPublishing(null);
    const updated = updatedProducts.find((p) => p.id === product.id);
    const finalStatus = updated?.publishStatus[platformKey]?.status;
    toast(
      finalStatus === "published" ? `已发布到${platformLabel(platformKey)}` : `发布到${platformLabel(platformKey)}失败，请重试`,
      finalStatus === "published" ? "success" : "danger"
    );
  }

  function platformLabel(key) {
    return PUBLISH_PLATFORMS.find((p) => p.key === key)?.label ?? key;
  }

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">发布</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
          <div className="fdr-field" style={{ margin: 0, minWidth: 160 }}>
            <label className="fdr-field__label">发布到</label>
            <select className="fdr-select" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PUBLISH_PLATFORMS.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          <Button
            variant="secondary"
            onClick={() => onChange(markProductReady(product.id, platform))}
          >
            标记为待发布
          </Button>
          <Button variant="primary" disabled={publishing === platform} onClick={() => handlePublish(platform)}>
            {publishing === platform ? "发布中…" : "发布"}
          </Button>
        </div>
      </div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">各平台发布状态</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>
          发布到某一个平台不会连带把其它平台标记为已发布，每个平台的发布状态完全独立。
        </p>
        <DataTable
          columns={[
            { key: "platform", label: "平台" },
            {
              key: "status",
              label: "发布状态",
              render: (r) => <StatusPill tone={PUBLISH_STATUS_TONE[r.detail.status]}>{getPublishStatusLabel(r.detail.status)}</StatusPill>,
            },
            { key: "publishedAt", label: "发布时间", render: (r) => (r.detail.publishedAt ? new Date(r.detail.publishedAt).toLocaleString("zh-CN") : "—") },
            { key: "platformProductId", label: "平台商品 ID", render: (r) => r.detail.platformProductId ?? "—" },
            { key: "failureReason", label: "失败原因", render: (r) => r.detail.failureReason ?? "—" },
            {
              key: "actions",
              label: "操作",
              render: (r) => {
                if (r.detail.status === "published") {
                  return (
                    <Button size="sm" variant="ghost" onClick={() => toast(`（演示）打开 ${r.platform} 上的商品页`, "success")}>
                      查看平台页面
                    </Button>
                  );
                }
                if (r.detail.status === "failed") {
                  return (
                    <Button size="sm" variant="secondary" disabled={publishing === r.platformKey} onClick={() => handlePublish(r.platformKey)}>
                      {publishing === r.platformKey ? "重试中…" : "重试"}
                    </Button>
                  );
                }
                return null;
              },
            },
          ]}
          rows={PUBLISH_PLATFORMS.map((p) => ({ platform: p.label, platformKey: p.key, detail: product.publishStatus[p.key] }))}
        />
      </div>
    </div>
  );
}

export function ProductDetailView({ product, onChange }) {
  const { tab, navigate, subView } = useConsoleNavContext();
  const activeTab = tab ?? "overview";

  function handleFieldSave(field, value) {
    onChange(updateProductField(product.id, field, value));
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{product.title}</h2>
          <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "var(--text-secondary)" }}>
            {product.sku} · {getStoreName(product.storeId)} · {product.category}
          </p>
        </div>
        <StatusPill tone={STATUS_TONE[product.status]}>{getProductStatusLabel(product.status)}</StatusPill>
      </div>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={(t) => navigate("productCenter", { subView, entityId: product.id, tab: t })} />

      {activeTab === "overview" && (
        <div className="fdr-card">
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 14, margin: 0 }}>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>所属店铺</dt><dd style={{ margin: 0 }}>{getStoreName(product.storeId)}</dd></div>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>类目</dt><dd style={{ margin: 0 }}>{product.category}</dd></div>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>售价</dt><dd style={{ margin: 0 }}>¥{product.price}</dd></div>
            <div><dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>库存</dt><dd style={{ margin: 0 }}>{product.stock}</dd></div>
            <div>
              <dt style={{ fontSize: 12, color: "var(--text-secondary)" }}>最近同步</dt>
              <dd style={{ margin: 0 }}>{product.lastSyncedAt ? new Date(product.lastSyncedAt).toLocaleString("zh-CN") : "尚未同步"}</dd>
            </div>
          </dl>
        </div>
      )}

      {activeTab === "pricing" && (
        <div className="fdr-card">
          <div className="fdr-field">
            <label className="fdr-field__label">售价（¥）</label>
            <input className="fdr-input" type="number" defaultValue={product.price} onBlur={(e) => handleFieldSave("price", Number(e.target.value))} />
          </div>
          <div className="fdr-field">
            <label className="fdr-field__label">成本（¥）</label>
            <input className="fdr-input" type="number" defaultValue={product.cost} onBlur={(e) => handleFieldSave("cost", Number(e.target.value))} />
          </div>
          <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            毛利率：{Math.round(((product.price - product.cost) / product.price) * 100)}%
          </p>
        </div>
      )}

      {activeTab === "inventory" && (
        <div className="fdr-card">
          <div className="fdr-field">
            <label className="fdr-field__label">库存数量</label>
            <input className="fdr-input" type="number" defaultValue={product.stock} onBlur={(e) => handleFieldSave("stock", Number(e.target.value))} />
          </div>
        </div>
      )}

      {activeTab === "listing" && <ListingTab product={product} onChange={onChange} />}

      {activeTab === "aiContent" && <AiContentTab product={product} onChange={onChange} />}
    </div>
  );
}
