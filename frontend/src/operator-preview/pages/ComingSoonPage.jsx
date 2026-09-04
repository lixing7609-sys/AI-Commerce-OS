import { DEMO_DATA_LABEL } from "../previewData";

/**
 * 经营者最终导航结构里，有几个模块（商品/内容/订单/客服/审批）在
 * Founder 版已经存在完整实现，但经营者版这几个页面还没有专门建设
 * ——不是缺失/崩溃，是有真实标题、真实布局、清楚说明"即将上线"的
 * 骨架页，避免用户看到空白页面或报错。与 Founder 的
 * console/kit/ModuleSkeleton.jsx 是同一个用途，这里用 op- 样式重做
 * 一份，因为两边的 CSS 体系完全独立。
 */
export function ComingSoonPage({ title, description, plannedFeatures = [] }) {
  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <em className="op-demo-badge">{DEMO_DATA_LABEL}</em>
      </header>
      <section className="op-panel">
        <div className="op-empty-state large">
          <div>该模块即将上线</div>
          <p className="op-empty-hint">Founder 版已经在使用同类能力，经营者版正在按受限权限范围逐步开放。</p>
        </div>
        {plannedFeatures.length > 0 ? (
          <ul className="op-memory-summary-list">
            {plannedFeatures.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
