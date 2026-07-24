import { useMemo } from "react";
import { useToast } from "../../kit/useToast.js";
import { Button } from "../../kit/Button.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { StatCard, StatGrid } from "../../kit/StatCard.jsx";
import { getAfterSalesReview } from "../../mock/afterSalesMock.js";
import { getDailyCsAnalytics } from "../../mock/dailyCustomerServiceMock.js";

export function CustomerServiceReview() {
  const toast = useToast();
  const review = useMemo(() => getAfterSalesReview(), []);
  const daily = useMemo(() => getDailyCsAnalytics(), []);

  return (
    <div>
      <div className="fdr-card">
        <h3 className="fdr-card__title">日常客服复盘</h3>
        <StatGrid>
          <StatCard label="AI 解决率" value={daily.aiResolutionRate} />
          <StatCard label="人工接管率" value={daily.humanTakeoverRate} />
          <StatCard label="满意度" value={daily.satisfaction} />
          <StatCard label="咨询转化率" value={daily.enquiryToOrderConversion} />
        </StatGrid>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">商品退款率（售后）</h3>
        <DataTable
          columns={[
            { key: "product", label: "商品" },
            { key: "refundRate", label: "退款率" },
          ]}
          rows={review.productRefundRates}
        />
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">根因分析</h3>
        <DataTable
          columns={[
            { key: "cause", label: "根因" },
            { key: "count", label: "涉及案例数" },
          ]}
          rows={review.rootCauses}
        />
      </div>

      <div className="fdr-card">
        <dl style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, margin: 0, fontSize: 13 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>供应商问题</dt><dd style={{ margin: 0 }}>{review.supplierIssues.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>物流问题</dt><dd style={{ margin: 0 }}>{review.logisticsIssues.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>内容夸大宣称</dt><dd style={{ margin: 0 }}>{review.contentOverpromise.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>直播话术夸大</dt><dd style={{ margin: 0 }}>{review.liveScriptOverpromise.join("；")}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>店铺流程问题</dt><dd style={{ margin: 0 }}>{review.storeProcessIssues.join("；")}</dd></div>
        </dl>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">知识库更新建议</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {review.knowledgeUpdateSuggestions.map((s) => (
            <div key={s} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderRadius: 10, background: "var(--bg)" }}>
              <span style={{ fontSize: 13 }}>{s}</span>
              <Button size="sm" variant="secondary" onClick={() => toast("已创建知识库更新候选", "success")}>采纳为知识库候选</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
