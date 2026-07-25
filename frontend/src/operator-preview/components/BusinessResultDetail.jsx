import { useState } from "react";

import BusinessResultView from "./BusinessResultView";
import DevInfoCollapse from "./DevInfoCollapse";
import MoreActionsMenu from "./MoreActionsMenu";
import { usePreview } from "../helpers/previewContextCore";
import { DEMO_BADGE_LABEL } from "../helpers/formatters";
import { EXPORT_ACTIONS } from "../helpers/resultActions";

/**
 * 业务结果详情通用视图（阶段：产品原型）。
 *
 * 同时供 AI秘书处"已完成"详情、成果详情复用——避免维护两份几乎
 * 相同的结果展示逻辑。主操作（批准/驳回/要求补充/创建后续工作/
 * 标记已处理）平铺展示；复制内容、查看来源任务为次级操作；导出
 * 类操作全部收进"更多操作"；原始 JSON 默认折叠在"开发信息"里。
 */
function BusinessResultDetail({ item, shopName, onBack, backLabel = "返回" }) {
  const { showPrototypeNotice, isDemo } = usePreview();
  const [copyState, setCopyState] = useState("idle");

  async function handleCopy() {
    const text = item.conclusion ?? item.title;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="op-result-detail">
      {onBack && (
        <button type="button" className="op-link-button" onClick={onBack}>
          ← {backLabel}
        </button>
      )}

      <div className="op-result-detail-header">
        <div>
          <h2>{item.title}</h2>
          <p className="op-result-detail-sub">
            {item.typeLabel ?? item.agent} · {shopName ?? "未绑定店铺"} · {item.agent}
            {item.statusLabel && ` · ${item.statusLabel}`}
          </p>
        </div>
        {isDemo && <em className="op-demo-badge">{DEMO_BADGE_LABEL}</em>}
      </div>

      {item.conclusion && <p className="op-result-conclusion">{item.conclusion}</p>}

      <div className="op-card-actions primary-row">
        <button type="button" className="op-btn primary" onClick={() => showPrototypeNotice("批准")}>
          批准
        </button>
        <button type="button" className="op-btn" onClick={() => showPrototypeNotice("驳回")}>
          驳回
        </button>
        <button type="button" className="op-btn" onClick={() => showPrototypeNotice("要求补充")}>
          要求补充
        </button>
        <button type="button" className="op-btn" onClick={() => showPrototypeNotice("创建后续工作")}>
          创建后续工作
        </button>
        <button type="button" className="op-btn" onClick={() => showPrototypeNotice("标记已处理")}>
          标记已处理
        </button>
      </div>

      <div className="op-card-actions secondary-row">
        <button type="button" className="op-btn" onClick={handleCopy}>
          {copyState === "copied" ? "已复制" : "复制内容"}
        </button>
        <button type="button" className="op-btn" onClick={() => showPrototypeNotice("查看来源任务")}>
          查看来源任务
        </button>
        <MoreActionsMenu actions={EXPORT_ACTIONS} onPrototypeAction={showPrototypeNotice} />
      </div>

      <div className="op-panel">
        <h3>完整业务结果</h3>
        <BusinessResultView type={item.type} content={item.content} />
      </div>

      <DevInfoCollapse
        fields={[
          ["Task ID", item.devTaskId],
          ["root_task_id", item.devRootTaskId ?? item.devTaskId],
          ["parent_task_id", item.devParentTaskId ?? "—"],
          ["Provider", "deepseek"],
          ["Model", "deepseek-chat"],
        ]}
        rawJson={item.content}
      />
    </div>
  );
}

export default BusinessResultDetail;
