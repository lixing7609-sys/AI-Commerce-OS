import { useMemo, useState } from "react";
import { PageHeader } from "../../kit/PageHeader.jsx";
import { Tabs } from "../../kit/Tabs.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { DemoBadge } from "../../kit/StatusPill.jsx";
import { useToast } from "../../kit/useToast.js";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import {
  PUBLISH_PLATFORMS,
  getCategoriesForStore,
  getProducts,
  getProductsForStoreCategory,
  getStoreContextCounts,
  upsertProduct,
} from "../../mock/productMock.js";
import { DEMO_STORES } from "../../mock/storesMock.js";
import { ProductListView } from "./ProductListView.jsx";
import { ProductDetailView } from "./ProductDetailView.jsx";
import { ProductFormModal } from "./ProductFormModal.jsx";

/**
 * 商品中心导航层级：店铺 → 类目 → 商品（阶段 Founder UX Review
 * V3，P0-6）。店铺用 URL 的 subView 承载（可收藏/可刷新）；类目
 * 筛选与搜索/状态/平台筛选用组件内部 state 承载——这些是同一屏内
 * 的即时过滤条件，不需要各自占用一个 URL 参数位。
 */
export function ProductCenterModule() {
  const { subView, entityId, navigate } = useConsoleNavContext();
  const [products, setProducts] = useState(() => getProducts());
  const [category, setCategory] = useState(null);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const toast = useToast();

  const storeId = DEMO_STORES.find((s) => s.id === subView)?.id ?? DEMO_STORES[0].id;
  const storeName = DEMO_STORES.find((s) => s.id === storeId)?.name ?? storeId;

  const selected = entityId ? products.find((p) => p.id === entityId) : null;

  const categories = useMemo(() => getCategoriesForStore(storeId), [storeId, products]);
  const contextCounts = useMemo(() => getStoreContextCounts(storeId, category), [storeId, category, products]);

  const visibleProducts = useMemo(() => {
    let list = getProductsForStoreCategory(storeId, category);
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      list = list.filter((p) => p.title.toLowerCase().includes(kw) || p.sku.toLowerCase().includes(kw));
    }
    if (statusFilter) {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (platformFilter) {
      list = list.filter((p) => p.publishStatus[platformFilter]?.status !== "not_configured");
    }
    return list;
  }, [storeId, category, keyword, statusFilter, platformFilter, products]);

  if (selected) {
    return (
      <div>
        <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={() => navigate("productCenter", { subView: storeId })}>
          ← 返回商品列表
        </button>
        <ProductDetailView product={selected} onChange={setProducts} />
      </div>
    );
  }

  function handleStoreChange(nextStoreId) {
    setCategory(null);
    navigate("productCenter", { subView: nextStoreId });
  }

  return (
    <div>
      <PageHeader
        title="商品中心"
        subtitle={`当前店铺：${storeName} · 当前类目：${category ?? "全部类目"} · 共 ${contextCounts.total} 个商品`}
        actions={<DemoBadge />}
      />

      <Tabs
        tabs={DEMO_STORES.map((s) => ({ key: s.id, label: s.name }))}
        activeTab={storeId}
        onChange={handleStoreChange}
      />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <button
          type="button"
          className={"fdr-btn " + (category === null ? "fdr-btn--primary" : "fdr-btn--secondary")}
          onClick={() => setCategory(null)}
        >
          全部类目
        </button>
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            className={"fdr-btn " + (category === c ? "fdr-btn--primary" : "fdr-btn--secondary")}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <StatGrid>
        <StatCard label="商品数" value={contextCounts.total} />
        <StatCard label="草稿" value={contextCounts.draft} />
        <StatCard label="已发布" value={contextCounts.published} />
        <StatCard label="发布失败" value={contextCounts.failed} />
      </StatGrid>

      <div className="fdr-card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="fdr-input"
            style={{ maxWidth: 240 }}
            placeholder="搜索商品标题 / SKU"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          <select className="fdr-select" style={{ maxWidth: 160 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="active">已发布</option>
            <option value="out_of_stock">缺货</option>
          </select>
          <select className="fdr-select" style={{ maxWidth: 160 }} value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)}>
            <option value="">全部平台</option>
            {PUBLISH_PLATFORMS.map((p) => (
              <option key={p.key} value={p.key}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      <ProductListView products={visibleProducts} storeId={storeId} onChange={setProducts} onCreate={() => setFormOpen(true)} />

      <ProductFormModal
        open={formOpen}
        defaultStoreId={storeId}
        defaultCategory={category}
        onClose={() => setFormOpen(false)}
        onSave={(product) => {
          setProducts(upsertProduct(product));
          setFormOpen(false);
          toast("商品已创建", "success");
        }}
      />
    </div>
  );
}
