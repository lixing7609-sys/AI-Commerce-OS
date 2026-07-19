import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar";
import { getKnowledgeDocument, listKnowledgeDocuments } from "../services/knowledgeApi";

const ALL_CATEGORIES = "全部";

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString();
}

function KnowledgeBase({ onNavigate = () => {} }) {
  const [documents, setDocuments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);

  const [selectedId, setSelectedId] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDocuments() {
      try {
        const data = await listKnowledgeDocuments();

        if (cancelled) {
          return;
        }

        setDocuments(Array.isArray(data.items) ? data.items : []);
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("知识库文档加载失败：", err);
          setError(err.message || "知识库文档加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadDocuments();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId || !drawerOpen) {
      return undefined;
    }

    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);

      try {
        const data = await getKnowledgeDocument(selectedId);

        if (cancelled) {
          return;
        }

        setDetail(data);
        setDetailError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("文档详情加载失败：", err);
          setDetailError(err.message || "文档详情加载失败");
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedId, drawerOpen]);

  function handleSelectDocument(documentId) {
    setSelectedId(documentId);
    setDrawerOpen(true);
    setDetail(null);
    setDetailError(null);
  }

  function handleCloseDrawer() {
    setDrawerOpen(false);
  }

  const normalizedSearch = searchText.trim().toLowerCase();

  const filteredDocuments = documents.filter((doc) => {
    if (activeCategory !== ALL_CATEGORIES && doc.category !== activeCategory) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return (
      doc.title.toLowerCase().includes(normalizedSearch) ||
      doc.description.toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="knowledge"
        onNavigate={onNavigate}
        statusLabel={error ? "知识库异常" : "知识库正常"}
        statusOk={!error}
      />

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>知识库</h1>
            <p>当前为系统文档知识库，语义检索将在后续阶段接入。</p>
          </div>
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <div className="knowledge-toolbar">
            <input
              type="text"
              className="knowledge-search-input"
              placeholder="搜索文档标题或描述"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
          </div>

          <div className="task-filter-tabs">
            <button
              className={`task-filter-button${
                activeCategory === ALL_CATEGORIES ? " active" : ""
              }`}
              onClick={() => setActiveCategory(ALL_CATEGORIES)}
            >
              全部（{documents.length}）
            </button>

            {categories.map((category) => (
              <button
                key={category}
                className={`task-filter-button${
                  activeCategory === category ? " active" : ""
                }`}
                onClick={() => setActiveCategory(category)}
              >
                {category}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="task-loading">正在加载知识库文档……</div>
          ) : filteredDocuments.length === 0 ? (
            <div className="task-empty">没有符合条件的文档</div>
          ) : (
            <div className="knowledge-document-grid">
              {filteredDocuments.map((doc) => (
                <article
                  className="knowledge-document-card"
                  key={doc.id}
                  onClick={() => handleSelectDocument(doc.id)}
                >
                  <div className="knowledge-document-category">
                    {doc.category}
                  </div>
                  <strong>{doc.title}</strong>
                  <p>{doc.description || "暂无描述"}</p>
                  <small>最后更新：{formatDateTime(doc.last_updated)}</small>
                </article>
              ))}
            </div>
          )}
        </div>
      </main>

      {drawerOpen && (
        <div className="task-drawer-overlay" onClick={handleCloseDrawer}>
          <aside
            className="task-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="文档详情"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="task-drawer-header">
              <span>文档详情</span>
              <button
                type="button"
                className="task-drawer-close"
                onClick={handleCloseDrawer}
                aria-label="关闭"
              >
                ✕
              </button>
            </div>

            <div className="task-drawer-body">
              {detailLoading && !detail && (
                <div className="task-drawer-placeholder">正在加载文档…</div>
              )}

              {!detailLoading && detailError && !detail && (
                <div className="task-drawer-placeholder">
                  加载失败：{detailError}
                </div>
              )}

              {detail && (
                <>
                  <div className="task-drawer-status-row">
                    <span className="task-drawer-status">{detail.category}</span>
                    <span className="task-drawer-id">
                      更新于 {formatDateTime(detail.last_updated)}
                    </span>
                  </div>

                  <h3>{detail.title}</h3>

                  <pre className="task-drawer-json knowledge-document-content">
                    {detail.content}
                  </pre>

                  {detail.truncated && (
                    <p className="knowledge-truncated-hint">
                      文档较长，已截断显示。
                    </p>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

export default KnowledgeBase;
