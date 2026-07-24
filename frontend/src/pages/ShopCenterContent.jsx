import { useEffect, useState } from "react";

import ShopCredentialsForm from "../components/shops/ShopCredentialsForm";
import ShopFormDialog from "../components/shops/ShopFormDialog";
import {
  getAuthTypeLabel,
  getConnectionStatusLabel,
  getConnectionTestResultMessage,
  getPlatformLabel,
  getShopStatusLabel,
  PLATFORM_OPTIONS,
} from "../components/shops/shopLabels";
import { getDeliverables } from "../services/deliverableApi";
import {
  archiveShop,
  disableShop,
  enableShop,
  getShop,
  getShops,
  startShopOAuth,
  testShopConnection,
} from "../services/shopApi";
import { getTasks } from "../services/api";
import { getShopLink, isValidHttpUrl, setShopLink } from "../store/shopLinksStore";

/**
 * ShopCenter 的内容部分，从 ShopCenter.jsx 抽出（阶段：Founder
 * Operator Edition，经 owner 授权的机械抽取，逻辑/API 调用/状态
 * 管理完全不变，只是不再自带 Sidebar/dashboard-shell 外壳——由
 * 调用方决定外壳，避免在 Founder 控制台里出现双重导航。
 * ShopCenter.jsx 本身保留原有外壳，供 Developer 版继续使用。
 */

const STATUS_FILTERS = [
  { value: "", label: "全部状态" },
  { value: "active", label: "正常" },
  { value: "disabled", label: "已停用" },
  { value: "archived", label: "已归档" },
];

function formatDateTime(value) {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无";
  return date.toLocaleString();
}

/**
 * 店铺卡片上的"进入店铺"入口（阶段 Founder UX Review V3，P0-10）。
 * 未配置链接时按钮禁用并提示"未配置店铺链接"，点击"配置链接"就地
 * 展开一个小表单——不需要单独跳一个页面。链接校验只接受 http(s)
 * URL，每个店铺各自独立保存，不做全局默认值。
 */
function ShopLinkRow({ shop }) {
  const [link, setLink] = useState(() => getShopLink(shop.id));
  const [editing, setEditing] = useState(false);
  const [storeUrlDraft, setStoreUrlDraft] = useState(link.storeUrl);
  const [sellerCenterUrlDraft, setSellerCenterUrlDraft] = useState(link.sellerCenterUrl);
  const [error, setError] = useState(null);

  const hasLink = isValidHttpUrl(link.storeUrl);

  function handleSave(event) {
    event.stopPropagation();
    if (!isValidHttpUrl(storeUrlDraft)) {
      setError("店铺链接必须是有效的 http(s) 网址");
      return;
    }
    if (sellerCenterUrlDraft && !isValidHttpUrl(sellerCenterUrlDraft)) {
      setError("卖家中心链接必须是有效的 http(s) 网址");
      return;
    }
    const next = { storeUrl: storeUrlDraft, sellerCenterUrl: sellerCenterUrlDraft };
    setShopLink(shop.id, next);
    setLink(next);
    setError(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="shop-link-row" onClick={(event) => event.stopPropagation()}>
        <input
          placeholder="店铺链接 https://..."
          value={storeUrlDraft}
          onChange={(event) => setStoreUrlDraft(event.target.value)}
        />
        <input
          placeholder="卖家中心链接（可选）https://..."
          value={sellerCenterUrlDraft}
          onChange={(event) => setSellerCenterUrlDraft(event.target.value)}
        />
        {error && <div className="task-error">{error}</div>}
        <div className="shop-link-row-actions">
          <button type="button" className="os-btn primary" onClick={handleSave}>
            保存
          </button>
          <button
            type="button"
            className="os-btn"
            onClick={(event) => {
              event.stopPropagation();
              setStoreUrlDraft(link.storeUrl);
              setSellerCenterUrlDraft(link.sellerCenterUrl);
              setError(null);
              setEditing(false);
            }}
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="shop-link-row" onClick={(event) => event.stopPropagation()}>
      {hasLink ? (
        <button
          type="button"
          className="os-btn primary"
          onClick={() => window.open(link.storeUrl, "_blank", "noopener,noreferrer")}
        >
          进入店铺
        </button>
      ) : (
        <span className="shop-link-row-empty">未配置店铺链接</span>
      )}
      <button type="button" className="os-btn" onClick={() => setEditing(true)}>
        {hasLink ? "编辑链接" : "配置链接"}
      </button>
    </div>
  );
}

function ShopListView({ onOpenShop, onCreateShop }) {
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [platformFilter, setPlatformFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const data = await getShops({
          platform: platformFilter || undefined,
          status: statusFilter || undefined,
          keyword: keyword || undefined,
        });
        if (!cancelled) {
          setShops(data.items ?? []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("店铺列表加载失败：", err);
          setError("店铺数据加载失败");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [platformFilter, statusFilter, keyword]);

  return (
    <>
      <header className="workspace-header">
        <div>
          <h1>店铺中心</h1>
          <p>管理各平台店铺资料、授权信息与连接状态</p>
        </div>
        <button type="button" className="os-btn primary" onClick={onCreateShop}>
          + 新增店铺
        </button>
      </header>

      <div className="task-scroll-area">
        {error && <div className="task-error">{error}</div>}

        <div className="shop-filter-bar">
          <select
            value={platformFilter}
            onChange={(event) => setPlatformFilter(event.target.value)}
          >
            <option value="">全部平台</option>
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <input
            placeholder="搜索店铺名称 / 编号"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="task-loading">正在加载店铺……</div>
        ) : shops.length === 0 ? (
          <div className="task-empty">
            尚未添加店铺。完成平台注册后，可以在这里添加店铺资料和授权信息。
          </div>
        ) : (
          <div className="shop-card-grid">
            {shops.map((shop) => (
              <article
                key={shop.id}
                className="shop-card"
                onClick={() => onOpenShop(shop.id)}
              >
                <div className="shop-card-header">
                  <span className="shop-card-platform">
                    {getPlatformLabel(shop.platform)}
                  </span>
                  <span className={`shop-card-status ${shop.status}`}>
                    {getShopStatusLabel(shop.status)}
                  </span>
                </div>

                <h3>{shop.shop_name}</h3>

                <dl className="shop-card-meta">
                  <div>
                    <dt>平台店铺 ID</dt>
                    <dd>{shop.platform_shop_id || "未填写"}</dd>
                  </div>
                  <div>
                    <dt>主体公司</dt>
                    <dd>{shop.legal_entity_name || "未填写"}</dd>
                  </div>
                  <div>
                    <dt>连接状态</dt>
                    <dd>{getConnectionStatusLabel(shop.connection_status)}</dd>
                  </div>
                  <div>
                    <dt>授权方式</dt>
                    <dd>{getAuthTypeLabel(shop.auth_type)}</dd>
                  </div>
                  <div>
                    <dt>最近连接测试</dt>
                    <dd>{formatDateTime(shop.last_connection_test_at)}</dd>
                  </div>
                  <div>
                    <dt>最近同步</dt>
                    <dd>{formatDateTime(shop.last_sync_at)}</dd>
                  </div>
                  <div>
                    <dt>任务数量</dt>
                    <dd>{shop.task_count}</dd>
                  </div>
                  <div>
                    <dt>成果数量</dt>
                    <dd>{shop.deliverable_count}</dd>
                  </div>
                </dl>

                <ShopLinkRow shop={shop} />
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ShopDetailView({ shopId, onBack }) {
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [testResult, setTestResult] = useState(null);
  const [oauthResult, setOauthResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [shopTasks, setShopTasks] = useState([]);
  const [shopDeliverables, setShopDeliverables] = useState([]);

  async function reload() {
    try {
      const data = await getShop(shopId);
      setShop(data);
      setError(null);
    } catch (err) {
      console.error("店铺详情加载失败：", err);
      setError("店铺详情加载失败");
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
  }, [shopId]);

  useEffect(() => {
    if (activeTab !== "tasks") return;
    let cancelled = false;
    getTasks({ shopId, limit: 50 })
      .then((data) => {
        if (!cancelled) setShopTasks(data.items ?? []);
      })
      .catch((err) => console.error("店铺任务加载失败：", err));
    return () => {
      cancelled = true;
    };
  }, [activeTab, shopId]);

  useEffect(() => {
    if (activeTab !== "deliverables") return;
    let cancelled = false;
    getDeliverables({ shopId, limit: 50 })
      .then((data) => {
        if (!cancelled) setShopDeliverables(data.items ?? []);
      })
      .catch((err) => console.error("店铺成果加载失败：", err));
    return () => {
      cancelled = true;
    };
  }, [activeTab, shopId]);

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testShopConnection(shopId);
      setTestResult(result);
      await reload();
    } catch (err) {
      console.error("测试连接失败：", err);
      setTestResult({ status: "error", message: "测试连接请求失败，请稍后重试" });
    } finally {
      setTesting(false);
    }
  }

  async function handleStartOAuth() {
    try {
      const result = await startShopOAuth(shopId);
      setOauthResult(result);
    } catch (err) {
      console.error("获取 OAuth 信息失败：", err);
    }
  }

  async function handleStatusAction(action) {
    try {
      if (action === "enable") await enableShop(shopId);
      if (action === "disable") await disableShop(shopId);
      if (action === "archive") await archiveShop(shopId);
      await reload();
    } catch (err) {
      console.error("店铺状态操作失败：", err);
    }
  }

  if (loading) {
    return <div className="task-loading">正在加载店铺详情……</div>;
  }

  if (error || !shop) {
    return (
      <>
        <div className="task-error">{error || "未找到该店铺"}</div>
        <button type="button" className="os-btn" onClick={onBack}>
          返回店铺列表
        </button>
      </>
    );
  }

  return (
    <>
      <header className="workspace-header">
        <div>
          <button type="button" className="os-btn-link" onClick={onBack}>
            ← 返回店铺列表
          </button>
          <h1>{shop.shop_name}</h1>
          <p>
            {getPlatformLabel(shop.platform)} · {getShopStatusLabel(shop.status)} ·{" "}
            {shop.shop_code}
          </p>
        </div>

        <div className="shop-detail-actions">
          <button type="button" className="os-btn" onClick={() => setEditing(true)}>
            编辑
          </button>
          {shop.status === "active" ? (
            <button type="button" className="os-btn" onClick={() => handleStatusAction("disable")}>
              停用
            </button>
          ) : (
            <button type="button" className="os-btn" onClick={() => handleStatusAction("enable")}>
              启用
            </button>
          )}
          {shop.status !== "archived" && (
            <button type="button" className="os-btn" onClick={() => handleStatusAction("archive")}>
              归档
            </button>
          )}
        </div>
      </header>

      <div className="task-scroll-area">
        {editing && (
          <div className="shop-form-panel">
            <ShopFormDialog
              mode="edit"
              initialShop={shop}
              onSaved={async () => {
                setEditing(false);
                await reload();
              }}
              onCancel={() => setEditing(false)}
            />
          </div>
        )}

        <div className="shop-detail-tabs">
          {[
            ["overview", "概览"],
            ["auth", "连接与授权"],
            ["tasks", "任务"],
            ["deliverables", "成果"],
            ["sync", "同步日志"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              className={`task-filter-button${activeTab === key ? " active" : ""}`}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <dl className="task-drawer-meta shop-overview-meta">
            <div>
              <dt>平台店铺 ID</dt>
              <dd>{shop.platform_shop_id || "未填写"}</dd>
            </div>
            <div>
              <dt>主体公司</dt>
              <dd>{shop.legal_entity_name || "未填写"}</dd>
            </div>
            <div>
              <dt>地区</dt>
              <dd>{shop.region || "未填写"}</dd>
            </div>
            <div>
              <dt>币种</dt>
              <dd>{shop.currency || "未填写"}</dd>
            </div>
            <div>
              <dt>时区</dt>
              <dd>{shop.timezone || "未填写"}</dd>
            </div>
            <div>
              <dt>创建时间</dt>
              <dd>{formatDateTime(shop.created_at)}</dd>
            </div>
            <div>
              <dt>真实任务数量</dt>
              <dd>{shop.task_count}</dd>
            </div>
            <div>
              <dt>真实成果数量</dt>
              <dd>{shop.deliverable_count}</dd>
            </div>
          </dl>
        )}

        {activeTab === "auth" && (
          <div className="shop-auth-panel">
            <section>
              <h4>凭据</h4>
              <ShopCredentialsForm
                shopId={shop.id}
                credentials={shop.credentials}
                onSaved={reload}
              />
            </section>

            <section className="shop-connection-section">
              <h4>测试连接</h4>
              <button
                type="button"
                className="os-btn"
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? "测试中…" : "测试连接"}
              </button>
              {testResult && (
                <p className="shop-form-hint">
                  {getConnectionTestResultMessage(testResult.status, testResult.message)}
                </p>
              )}
              <p className="shop-form-hint">
                最近测试：{formatDateTime(shop.last_connection_test_at)}（
                {shop.last_connection_test_status
                  ? getConnectionTestResultMessage(shop.last_connection_test_status)
                  : "暂无记录"}
                ）
              </p>
            </section>

            <section className="shop-connection-section">
              <h4>OAuth 授权</h4>
              <button type="button" className="os-btn" onClick={handleStartOAuth}>
                发起 OAuth 授权
              </button>
              {oauthResult && (
                <p className="shop-form-hint">
                  {oauthResult.authorize_url
                    ? "已生成授权链接"
                    : "当前平台 OAuth 连接器尚未接入。"}
                </p>
              )}
            </section>
          </div>
        )}

        {activeTab === "tasks" && (
          <div className="shop-related-list">
            {shopTasks.length === 0 ? (
              <div className="task-empty">该店铺暂无任务</div>
            ) : (
              <div className="task-list">
                {shopTasks.map((task) => (
                  <div className="task-row" key={task.id}>
                    <span>{task.id}</span>
                    <span>{task.task_type}</span>
                    <span>{task.assigned_agent ?? "—"}</span>
                    <span className={`task-status ${task.status}`}>{task.status}</span>
                    <span>{formatDateTime(task.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "deliverables" && (
          <div className="shop-related-list">
            {shopDeliverables.length === 0 ? (
              <div className="task-empty">该店铺暂无成果</div>
            ) : (
              <div className="task-list">
                {shopDeliverables.map((item) => (
                  <div className="task-row" key={item.id}>
                    <span>{item.title}</span>
                    <span>{item.agent_name}</span>
                    <span className={`task-status ${item.status}`}>{item.status}</span>
                    <span>{formatDateTime(item.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "sync" && (
          <div className="task-empty">尚未接入真实平台同步。</div>
        )}
      </div>
    </>
  );
}

function ShopCenterContent() {
  const [view, setView] = useState("list");
  const [selectedShopId, setSelectedShopId] = useState(null);

  if (view === "new") {
    return (
      <>
        <header className="workspace-header">
          <div>
            <button type="button" className="os-btn-link" onClick={() => setView("list")}>
              ← 返回店铺列表
            </button>
            <h1>新增店铺</h1>
            <p>选择平台并填写店铺资料</p>
          </div>
        </header>
        <div className="task-scroll-area">
          <div className="shop-form-panel">
            <ShopFormDialog
              mode="create"
              onSaved={(created) => {
                setSelectedShopId(created.id);
                setView("detail");
              }}
              onCancel={() => setView("list")}
            />
          </div>
        </div>
      </>
    );
  }

  if (view === "detail" && selectedShopId) {
    return (
      <ShopDetailView shopId={selectedShopId} onBack={() => setView("list")} />
    );
  }

  return (
    <ShopListView
      onCreateShop={() => setView("new")}
      onOpenShop={(shopId) => {
        setSelectedShopId(shopId);
        setView("detail");
      }}
    />
  );
}

export default ShopCenterContent;
