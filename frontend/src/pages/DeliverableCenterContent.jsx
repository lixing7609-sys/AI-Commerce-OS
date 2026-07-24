import { useEffect, useState } from "react";

import CeoAnalysisView from "../components/analysisViews/CeoAnalysisView";
import ProductAnalysisView from "../components/analysisViews/ProductAnalysisView";
import SalesAnalysisView from "../components/analysisViews/SalesAnalysisView";
import CreateFollowUpTaskDialog from "../components/deliverables/CreateFollowUpTaskDialog";
import {
  DELIVERABLE_STATUS_FILTERS,
  DELIVERABLE_TYPE_FILTERS,
  getDeliverableStatusLabel,
  getDeliverableTypeLabel,
  getExportFormatLabel,
} from "../components/deliverables/deliverableLabels";
import ShopScopeSelector from "../components/shops/ShopScopeSelector";
import { getAgents } from "../services/agentApi";
import {
  approveDeliverable,
  archiveDeliverable,
  exportDeliverable,
  getDeliverable,
  getDeliverables,
  rejectDeliverable,
  restoreDeliverable,
} from "../services/deliverableApi";
import { getShops } from "../services/shopApi";
import {
  getStoredShopScope,
  setStoredShopScope,
  shopScopeToQueryParams,
} from "../store/shopScopeStore";

/**
 * DeliverableCenter 的内容部分，从 DeliverableCenter.jsx 抽出
 * （阶段：Founder Operator Edition，owner 授权的机械抽取，逻辑/
 * API 调用/状态管理完全不变，只是不再自带 Sidebar/dashboard-shell
 * 外壳）。DeliverableCenter.jsx 本身保留原有外壳，供 Developer 版
 * 继续使用。
 */

const EXPORT_FORMATS = ["markdown", "pdf", "docx", "xlsx", "json"];

function formatDateTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleString();
}

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

function DeliverableListView({ onOpenDeliverable, onNavigateToTask }) {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [keyword, setKeyword] = useState("");
  const [shopScope, setShopScope] = useState(() => getStoredShopScope());
  const [shops, setShops] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getShops({ status: "active" })
      .then((data) => {
        if (!cancelled) setShops(data.items ?? []);
      })
      .catch((err) => console.error("店铺列表加载失败：", err));
    return () => {
      cancelled = true;
    };
  }, []);

  function handleShopScopeChange(nextScope) {
    setShopScope(nextScope);
    setStoredShopScope(nextScope);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getDeliverables({
          status: statusFilter === "all" ? undefined : statusFilter,
          deliverableType: typeFilter === "all" ? undefined : typeFilter,
          keyword: keyword || undefined,
          limit: 50,
          ...shopScopeToQueryParams(shopScope),
        });
        if (!cancelled) {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("成果列表加载失败：", err);
          setError("成果数据加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, typeFilter, keyword, shopScope]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>成果中心</h1>
          <p>查看 AI 员工完成的正式成果，导出文件并继续派工</p>
        </div>
        <ShopScopeSelector value={shopScope} onChange={handleShopScopeChange} shops={shops} />
      </header>

      <div className="task-scroll-area">
        {error && <div className="task-error">{error}</div>}

        <div className="task-filter-tabs">
          {DELIVERABLE_STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              className={`task-filter-button${statusFilter === option.value ? " active" : ""}`}
              onClick={() => setStatusFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="task-filter-tabs">
          {DELIVERABLE_TYPE_FILTERS.map((option) => (
            <button
              key={option.value}
              className={`task-filter-button${typeFilter === option.value ? " active" : ""}`}
              onClick={() => setTypeFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="shop-filter-bar">
          <input
            placeholder="搜索成果标题 / 摘要"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="task-loading">正在加载成果……</div>
        ) : items.length === 0 ? (
          <div className="task-empty">
            当前还没有成果。AI 员工完成支持的任务后，成果会显示在这里。
          </div>
        ) : (
          <div className="deliverable-card-grid">
            {items.map((item) => (
              <article
                key={item.id}
                className="deliverable-card"
                onClick={() => onOpenDeliverable(item.id)}
              >
                <div className="deliverable-card-header">
                  <span className="deliverable-card-type">
                    {getDeliverableTypeLabel(item.deliverable_type)}
                  </span>
                  <span className={`deliverable-card-status ${item.status}`}>
                    {getDeliverableStatusLabel(item.status)}
                  </span>
                </div>

                <h3>{item.title}</h3>

                {item.summary && <p className="deliverable-card-summary">{item.summary}</p>}

                <dl className="deliverable-card-meta">
                  <div>
                    <dt>AI 员工</dt>
                    <dd>{item.agent_name}</dd>
                  </div>
                  <div>
                    <dt>店铺</dt>
                    <dd>{item.shop_name || "未绑定店铺"}</dd>
                  </div>
                  <div>
                    <dt>当前版本</dt>
                    <dd>v{item.current_version}</dd>
                  </div>
                  <div>
                    <dt>创建时间</dt>
                    <dd>{formatDateTime(item.created_at)}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  className="os-btn-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    onNavigateToTask(item.source_task_id);
                  }}
                >
                  查看来源任务 →
                </button>
              </article>
            ))}
          </div>
        )}

        <div className="task-pagination-hint">
          当前显示 {items.length} 条，共 {total} 条
        </div>
      </div>
    </>
  );
}

function AnalysisContent({ deliverable }) {
  const version = deliverable.current_version_data;

  if (!version) {
    return <p className="sales-analysis-text">暂无内容</p>;
  }

  if (version.format === "text") {
    return <p className="sales-analysis-text">{version.structured_content?.text || "暂无内容"}</p>;
  }

  if (deliverable.deliverable_type === "ceo_analysis") {
    return <CeoAnalysisView data={version.structured_content} />;
  }
  if (deliverable.deliverable_type === "sales_analysis") {
    return <SalesAnalysisView data={version.structured_content} />;
  }
  if (deliverable.deliverable_type === "product_analysis") {
    return <ProductAnalysisView data={version.structured_content} />;
  }

  return (
    <pre className="task-drawer-json">
      {JSON.stringify(version.structured_content, null, 2)}
    </pre>
  );
}

function DeliverableDetailView({ deliverableId, onBack, onNavigateToTask }) {
  const [deliverable, setDeliverable] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copyState, setCopyState] = useState("idle");
  const [exportingFormat, setExportingFormat] = useState(null);
  const [showJson, setShowJson] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [shops, setShops] = useState([]);
  const [agents, setAgents] = useState([]);

  async function reload() {
    try {
      const data = await getDeliverable(deliverableId);
      setDeliverable(data);
      setError(null);
    } catch (err) {
      console.error("成果详情加载失败：", err);
      setError("成果详情加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    async function initialLoad() {
      setLoading(true);
      await reload();
    }

    initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliverableId]);

  useEffect(() => {
    getShops().then((data) => setShops(data.items ?? [])).catch(() => {});
    getAgents().then((data) => setAgents(data.items ?? [])).catch(() => {});
  }, []);

  async function handleAction(action) {
    try {
      if (action === "approve") await approveDeliverable(deliverableId);
      if (action === "reject") await rejectDeliverable(deliverableId);
      if (action === "archive") await archiveDeliverable(deliverableId);
      if (action === "restore") await restoreDeliverable(deliverableId);
      await reload();
    } catch (err) {
      console.error(`成果操作失败（${action}）：`, err);
    }
  }

  async function handleExport(format) {
    setExportingFormat(format);
    try {
      const { blob, filename } = await exportDeliverable(deliverableId, format);
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(`导出失败（${format}）：`, err);
    } finally {
      setExportingFormat(null);
    }
  }

  async function handleCopy() {
    if (!deliverable?.current_version_data) return;
    const text =
      deliverable.current_version_data.format === "text"
        ? deliverable.current_version_data.structured_content?.text || ""
        : deliverable.current_version_data.content;

    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch (err) {
      console.error("复制失败：", err);
      setCopyState("failed");
    }
  }

  if (loading) {
    return <div className="task-loading">正在加载成果详情……</div>;
  }

  if (error || !deliverable) {
    return (
      <>
        <div className="task-error">{error || "未找到该成果"}</div>
        <button type="button" className="os-btn" onClick={onBack}>
          返回成果列表
        </button>
      </>
    );
  }

  const actions = deliverable.available_actions || [];

  return (
    <>
      <header className="workspace-header">
        <div>
          <button type="button" className="os-btn-link" onClick={onBack}>
            ← 返回成果列表
          </button>
          <h1>{deliverable.title}</h1>
          <p>
            {getDeliverableTypeLabel(deliverable.deliverable_type)} ·{" "}
            {getDeliverableStatusLabel(deliverable.status)} · v{deliverable.current_version}
          </p>
        </div>
      </header>

      <div className="task-scroll-area">
        <dl className="task-drawer-meta">
          <div>
            <dt>来源任务</dt>
            <dd>
              <button
                type="button"
                className="os-btn-link"
                onClick={() => onNavigateToTask(deliverable.source_task_id)}
              >
                {deliverable.source_task_id}
              </button>
            </dd>
          </div>
          <div>
            <dt>所属店铺</dt>
            <dd>{deliverable.shop?.shop_name || "未绑定店铺"}</dd>
          </div>
          <div>
            <dt>AI 员工</dt>
            <dd>{deliverable.agent_name}</dd>
          </div>
          <div>
            <dt>生成时间</dt>
            <dd>{formatDateTime(deliverable.created_at)}</dd>
          </div>
          {deliverable.parent_task && (
            <div>
              <dt>父任务</dt>
              <dd>
                <button
                  type="button"
                  className="os-btn-link"
                  onClick={() => onNavigateToTask(deliverable.parent_task.id)}
                >
                  {deliverable.parent_task.id}
                </button>
              </dd>
            </div>
          )}
        </dl>

        <div className="deliverable-action-bar">
          <button type="button" className="os-btn" onClick={handleCopy}>
            {copyState === "copied" ? "已复制" : "复制内容"}
          </button>
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              className="os-btn"
              onClick={() => handleExport(format)}
              disabled={exportingFormat === format}
            >
              {exportingFormat === format ? "导出中…" : `下载 ${getExportFormatLabel(format)}`}
            </button>
          ))}
          <button type="button" className="os-btn" onClick={() => setShowJson((v) => !v)}>
            {showJson ? "隐藏 JSON" : "查看 JSON"}
          </button>
        </div>

        <div className="deliverable-action-bar">
          {actions.includes("approve") && (
            <button type="button" className="os-btn primary" onClick={() => handleAction("approve")}>
              批准
            </button>
          )}
          {actions.includes("reject") && (
            <button type="button" className="os-btn" onClick={() => handleAction("reject")}>
              驳回
            </button>
          )}
          {actions.includes("archive") && (
            <button type="button" className="os-btn" onClick={() => handleAction("archive")}>
              归档
            </button>
          )}
          {actions.includes("restore") && (
            <button type="button" className="os-btn" onClick={() => handleAction("restore")}>
              恢复
            </button>
          )}
          {actions.includes("create_follow_up_task") && (
            <button type="button" className="os-btn primary" onClick={() => setFollowUpOpen(true)}>
              基于成果创建任务
            </button>
          )}
        </div>

        <h4>完整结果</h4>
        <AnalysisContent deliverable={deliverable} />

        {showJson && (
          <pre className="task-drawer-json">
            {JSON.stringify(deliverable.current_version_data?.structured_content ?? {}, null, 2)}
          </pre>
        )}

        {deliverable.versions.length > 1 && (
          <div className="task-drawer-delegation-section">
            <h4>历史版本</h4>
            <ul>
              {deliverable.versions.map((version) => (
                <li key={version.version_number}>
                  v{version.version_number} · {formatDateTime(version.created_at)} ·{" "}
                  {version.created_by === "system" ? "系统生成" : "人工生成"}
                </li>
              ))}
            </ul>
          </div>
        )}

        {deliverable.child_tasks.length > 0 && (
          <div className="task-drawer-delegation-section">
            <h4>相关子任务</h4>
            <div className="task-drawer-children-list">
              {deliverable.child_tasks.map((task) => (
                <button
                  type="button"
                  key={task.id}
                  className="task-drawer-link-button"
                  onClick={() => onNavigateToTask(task.id)}
                >
                  <span className={`task-status ${task.status}`}>{task.status}</span>
                  <span>{task.assigned_agent ?? "—"}</span>
                  <span>{task.task_type}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {followUpOpen && (
        <CreateFollowUpTaskDialog
          deliverable={deliverable}
          shops={shops}
          agents={agents}
          onClose={() => setFollowUpOpen(false)}
          onCreated={reload}
        />
      )}
    </>
  );
}

function DeliverableCenterContent({ onNavigateToTask = () => {}, selectedDeliverableId = null }) {
  const [view, setView] = useState(selectedDeliverableId ? "detail" : "list");
  const [activeDeliverableId, setActiveDeliverableId] = useState(selectedDeliverableId);

  const [prevSelectedId, setPrevSelectedId] = useState(null);
  if (selectedDeliverableId && selectedDeliverableId !== prevSelectedId) {
    setPrevSelectedId(selectedDeliverableId);
    setActiveDeliverableId(selectedDeliverableId);
    setView("detail");
  }

  if (view === "detail" && activeDeliverableId) {
    return (
      <DeliverableDetailView
        deliverableId={activeDeliverableId}
        onBack={() => setView("list")}
        onNavigateToTask={onNavigateToTask}
      />
    );
  }

  return (
    <DeliverableListView
      onNavigateToTask={onNavigateToTask}
      onOpenDeliverable={(id) => {
        setActiveDeliverableId(id);
        setView("detail");
      }}
    />
  );
}

export default DeliverableCenterContent;
