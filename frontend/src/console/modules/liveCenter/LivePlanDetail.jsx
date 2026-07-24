import { useState } from "react";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { Button } from "../../kit/Button.jsx";
import { DataTable } from "../../kit/DataTable.jsx";
import { EmptyState } from "../../kit/EmptyState.jsx";
import { useToast } from "../../kit/useToast.js";
import { getStoreName } from "../../mock/storesMock.js";
import {
  LIVE_MODES,
  PRODUCT_ROLES,
  generateLineup,
  generateLiveClips,
  generateScript,
  getLiveState,
} from "../../mock/liveMock.js";

const ROLE_TONE = { hero: "success", traffic: "info", welfare: "warning", profit: "neutral", carry: "neutral", clearance: "danger" };

/**
 * 直播计划详情——直接内嵌展示这个计划产生的全部 Deliverable（排品
 * /脚本/切片/复盘），不需要跳到"直播排品""直播脚本""直播复盘"
 * 各自独立选计划再查看（阶段 V4.2 架构修正）。
 */
export function LivePlanDetail({ plan, onBack, onChange }) {
  const toast = useToast();
  const [state, setState] = useState(() => getLiveState());
  const [clips, setClips] = useState(null);

  const lineup = (state.lineups[plan.id] ?? []).sort((a, b) => a.sequence - b.sequence);
  const script = state.scripts[plan.id] ?? [];
  const review = state.reviews.find((r) => r.livePlanTitle === plan.title);

  function refresh() {
    const next = getLiveState();
    setState(next);
    onChange?.();
  }

  return (
    <div>
      <button className="fdr-btn fdr-btn--ghost" style={{ marginBottom: 12 }} onClick={onBack}>← 返回直播计划列表</button>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h3 style={{ margin: "0 0 4px 0" }}>{plan.title}</h3>
            <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>
              {getStoreName(plan.storeId)} · {plan.platform} · {LIVE_MODES.find((m) => m.key === plan.mode)?.label} · {new Date(plan.startTime).toLocaleString("zh-CN")}
            </p>
          </div>
          <StatusPill tone={plan.status === "直播中" ? "success" : plan.status === "已结束" ? "neutral" : "warning"}>{plan.status}</StatusPill>
        </div>
        <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, marginTop: 14 }}>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>GMV 目标</dt><dd style={{ margin: 0 }}>¥{plan.gmvGoal.toLocaleString()}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>订单目标</dt><dd style={{ margin: 0 }}>{plan.orderGoal}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>广告预算</dt><dd style={{ margin: 0 }}>¥{plan.adBudget}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>主播</dt><dd style={{ margin: 0 }}>{plan.host ?? "数字人"}</dd></div>
          <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>审批状态</dt><dd style={{ margin: 0 }}>{plan.approvalStatus}</dd></div>
        </dl>
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>生成排品</h3>
          <Button size="sm" variant="secondary" onClick={() => { setState(generateLineup(plan.id)); toast("已生成排品", "success"); refresh(); }}>
            {lineup.length ? "重新生成" : "生成排品"}
          </Button>
        </div>
        {lineup.length === 0 ? (
          <EmptyState icon="▤" message="尚未生成排品" />
        ) : (
          <DataTable
            columns={[
              { key: "sequence", label: "顺序" },
              { key: "product", label: "商品" },
              { key: "role", label: "角色", render: (r) => <StatusPill tone={ROLE_TONE[r.role] ?? "neutral"}>{PRODUCT_ROLES.find((p) => p.key === r.role)?.label}</StatusPill> },
              { key: "price", label: "价格", render: (r) => `¥${r.price}` },
              { key: "expectedGmv", label: "预期 GMV", render: (r) => `¥${r.expectedGmv.toLocaleString()}` },
            ]}
            rows={lineup}
          />
        )}
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>生成脚本</h3>
          <Button size="sm" variant="secondary" onClick={() => { setState(generateScript(plan.id)); toast("已生成脚本", "success"); refresh(); }}>
            {script.length ? "重新生成" : "生成脚本"}
          </Button>
        </div>
        {script.length === 0 ? (
          <EmptyState icon="✎" message="尚未生成脚本" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {script.map((block) => (
              <div key={block.id} style={{ padding: "8px 10px", borderRadius: 8, background: "var(--bg)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 13 }}>{block.section}</strong>
                  <StatusPill tone={block.complianceStatus === "通过" ? "success" : "warning"}>{block.complianceStatus}</StatusPill>
                </div>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{block.scriptText}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fdr-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 className="fdr-card__title" style={{ margin: 0 }}>生成切片</h3>
          <Button
            size="sm"
            variant="secondary"
            disabled={plan.status !== "已结束"}
            onClick={() => { setClips(generateLiveClips(plan.id)); toast("已生成直播切片", "success"); }}
          >
            生成切片
          </Button>
        </div>
        {plan.status !== "已结束" ? (
          <EmptyState icon="▶" message="直播结束后才能生成切片" />
        ) : clips ? (
          <DataTable
            columns={[
              { key: "title", label: "切片名称" },
              { key: "durationSeconds", label: "时长（秒）" },
              { key: "performance", label: "表现" },
            ]}
            rows={clips}
          />
        ) : review ? (
          <DataTable
            columns={[{ key: "clip", label: "推荐切片" }]}
            rows={review.aiOutputs.recommendedClips.map((c) => ({ clip: c }))}
          />
        ) : (
          <EmptyState icon="▶" message="点击「生成切片」查看该场直播的可复用切片" />
        )}
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">复盘</h3>
        {review ? (
          <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12, margin: 0 }}>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>GMV</dt><dd style={{ margin: 0 }}>¥{review.gmv.toLocaleString()}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>转化率</dt><dd style={{ margin: 0 }}>{review.conversionRate}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>直播 ROI</dt><dd style={{ margin: 0 }}>{review.liveRoi}</dd></div>
            <div><dt style={{ fontSize: 11, color: "var(--text-secondary)" }}>建议下一场调整</dt><dd style={{ margin: 0 }}>{review.aiOutputs.recommendedNextPlan}</dd></div>
          </dl>
        ) : (
          <EmptyState icon="↻" message="该场直播尚未复盘（直播结束后自动生成复盘数据）" />
        )}
      </div>
    </div>
  );
}
