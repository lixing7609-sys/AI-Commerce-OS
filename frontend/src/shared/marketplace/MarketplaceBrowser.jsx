import { useMemo, useState } from "react";
import {
  listConsumablePackages,
  installationStateFor,
  installPackage,
  uninstallPackage,
  filterByCategory,
  filterByKeyword,
} from "./marketplaceService.js";
import { OPERATOR_CATEGORIES, STUDIO_CATEGORIES } from "./types.js";

/**
 * Operator/Studio 共用的 Marketplace 浏览组件（阶段 M8 §9/§13 规则
 * 6："Marketplace消费页面必须共享组件，但按targetProduct筛选"）。
 * 只有 `theme`（"operator"|"studio"）不同——决定用哪一端的分类清单
 * 和视觉类名前缀，数据查询、安装/卸载逻辑、列表/详情结构完全
 * 一份代码，不允许 Operator 和 Studio 各自维护一份浏览页面。
 *
 * 不依赖任何 Founder 全局状态（不 import console/ 任何东西）——独立
 * Operator/Studio 和 Founder 实验室都能直接渲染，符合 edition
 * boundary（scripts/editions/manifest.py 已经把 shared/ 列进两端
 * 的 include 清单）。
 */
/**
 * 两端现有 CSS 类名并不是简单的前缀替换关系（op-panel vs st-card，
 * op-btn.primary vs st-btn st-btn--primary……），所以用一张小映射表
 * 而不是字符串拼接——数据/逻辑仍然只有一份，只有类名查表不同。
 */
const THEME_CLASSES = {
  operator: {
    card: "op-panel",
    panelHeading: "op-panel-heading",
    btn: "op-btn",
    btnPrimary: "op-btn primary",
    demoBadge: "op-demo-badge",
    emptyState: "op-empty-state",
  },
  studio: {
    card: "st-card",
    panelHeading: "st-card-header",
    btn: "st-btn",
    btnPrimary: "st-btn st-btn--primary",
    demoBadge: "st-demo-badge",
    emptyState: "st-empty",
  },
};

export function MarketplaceBrowser({ theme }) {
  const cls = THEME_CLASSES[theme] ?? THEME_CLASSES.operator;
  const categories = theme === "studio" ? STUDIO_CATEGORIES : OPERATOR_CATEGORIES;
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [, forceRerender] = useState(0);

  const packages = useMemo(() => {
    let list = listConsumablePackages(theme);
    list = filterByCategory(list, category);
    list = filterByKeyword(list, keyword);
    return list;
  }, [theme, category, keyword]);

  const selected = selectedId ? packages.find((p) => p.id === selectedId) ?? listConsumablePackages(theme).find((p) => p.id === selectedId) : null;

  async function handleInstall(pkg) {
    await installPackage(pkg.id, theme);
    forceRerender((n) => n + 1);
  }

  async function handleUninstall(pkg) {
    await uninstallPackage(pkg.id);
    forceRerender((n) => n + 1);
  }

  if (selected) {
    const installation = installationStateFor(selected.id);
    const installed = installation.state === "installed";
    return (
      <div>
        <button type="button" className={cls.btn} onClick={() => setSelectedId(null)} style={{ marginBottom: 12 }}>
          ← 返回能力市场
        </button>
        <div className={cls.card}>
          <div className={cls.panelHeading}>
            <h3>{selected.name}</h3>
            <span className={cls.demoBadge}>演示数据</span>
          </div>
          <p>{selected.description}</p>
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, fontSize: 13 }}>
            <div><dt style={{ opacity: 0.6 }}>当前版本</dt><dd>{selected.currentVersion}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>发布渠道</dt><dd>{selected.releaseChannel}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>开发者</dt><dd>{selected.developer.displayName}（{selected.developer.tier}）</dd></div>
            <div><dt style={{ opacity: 0.6 }}>风险等级</dt><dd>{selected.riskLevel}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>定价</dt><dd>{describePricing(selected.pricingModel)}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>License</dt><dd>{selected.licensePolicy.termsSummary}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>Token 计费</dt><dd>{selected.tokenPolicy.consumesToken ? `约 ${selected.tokenPolicy.estimatedTokenPerRun ?? "—"} token/次` : "不消耗 Token"}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>已安装数</dt><dd>{selected.installCount}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>评分</dt><dd>{selected.rating ?? "暂无评价"}</dd></div>
            <div><dt style={{ opacity: 0.6 }}>真实验证</dt><dd>{describeEvaluation(selected.evaluationSummary, theme)}</dd></div>
          </dl>
          {selected.dependencies.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 13 }}>依赖：</strong>
              {selected.dependencies.map((d) => (
                <span key={d.packageId} style={{ marginLeft: 8, fontSize: 12, opacity: 0.7 }}>
                  {d.name} {d.versionRange}{d.optional ? "（可选）" : ""}
                </span>
              ))}
            </div>
          ) : null}
          <div style={{ marginTop: 16 }}>
            {installed ? (
              <button type="button" className={cls.btn} onClick={() => handleUninstall(selected)}>停用 / 卸载</button>
            ) : (
              <button type="button" className={cls.btnPrimary} onClick={() => handleInstall(selected)}>安装</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={cls.panelHeading}>
        <h3>AI 能力市场</h3>
        <span className={cls.demoBadge}>演示数据</span>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <input
          placeholder="搜索能力名称 / 简介"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(0,0,0,.15)", minWidth: 200 }}
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: "6px 10px", borderRadius: 6 }}>
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.key} value={c.key}>{c.label}</option>
          ))}
        </select>
      </div>

      {packages.length === 0 ? (
        <div className={cls.emptyState}>当前筛选条件下暂无可用能力</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {packages.map((pkg) => {
            const installation = installationStateFor(pkg.id);
            return (
              <article key={pkg.id} className={cls.card} style={{ cursor: "pointer" }} onClick={() => setSelectedId(pkg.id)}>
                <strong>{pkg.name}</strong>
                <p style={{ fontSize: 13, opacity: 0.75 }}>{pkg.summary}</p>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{describePricing(pkg.pricingModel)} · 已安装 {pkg.installCount}</div>
                <div style={{ marginTop: 8 }}>
                  {installation.state === "installed" ? (
                    <span style={{ fontSize: 12, color: "var(--success, #16a34a)" }}>已安装</span>
                  ) : (
                    <button
                      type="button"
                      className={cls.btnPrimary}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInstall(pkg);
                      }}
                    >
                      安装
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function describePricing(pricingModel) {
  if (pricingModel.model === "free") return "免费";
  if (pricingModel.model === "one_time") return `¥${pricingModel.priceRmb} 一次性`;
  if (pricingModel.model === "subscription") return `¥${pricingModel.priceRmb}/${pricingModel.billingCycle === "year" ? "年" : "月"}`;
  return "按用量计费";
}

function describeEvaluation(summary, theme) {
  const verifiedCount = theme === "studio" ? summary.verifiedContentProjectCount : summary.verifiedStoreCount;
  if (summary.evaluationScore == null && verifiedCount === 0) return "尚未在真实业务中验证";
  const unit = theme === "studio" ? "个内容项目" : "家店铺";
  return `评测分 ${summary.evaluationScore ?? "—"} · 已在 ${verifiedCount} ${unit}验证`;
}
