import { useEffect, useState } from "react";
import { getConnectorHealth } from "../connectorApi.js";

// 唯一可以显示具体底层服务名称（GPT / Claude Code）的页面 —— 主对话
// 界面永远只显示"Sino"，只有这里用于排查连接问题。
function StatusRow({ label, ready, detail }) {
  return (
    <div className="sf-card" style={{ marginBottom: 12 }}>
      <div className="founder-ai-row-header">
        <h3>{label}</h3>
        <span className={`sf-badge ${ready ? "success" : "danger"}`}>{ready ? "已连接（Real）" : "未就绪（Mock）"}</span>
      </div>
      <dl className="founder-ai-definition-grid">
        {Object.entries(detail || {}).map(([key, value]) => (
          <div key={key} style={{ display: "contents" }}>
            <dt>{key}</dt>
            <dd>{value === null || value === undefined ? "—" : String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ConnectorStatus() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // "重新检测"按钮的点击处理——事件处理函数里同步 setState 没问题，
  // 与下面挂载时的 useEffect（不能在 await 之前同步 setState）分开写。
  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const result = await getConnectorHealth();
      setHealth(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadOnMount() {
      try {
        const result = await getConnectorHealth();
        if (cancelled) return;
        setHealth(result);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadOnMount();
    return () => {
      cancelled = true;
    };
  }, []);

  const overallReal = health?.brain?.ready && health?.executor?.ready;

  return (
    <div className="founder-ai-view-shell">
      <div className="founder-ai-stack">
        <div className="sf-card">
          <div className="founder-ai-row-header">
            <h3>当前运行模式</h3>
            <span className={`sf-badge ${overallReal ? "success" : "warn"}`}>
              {loading ? "检测中…" : overallReal ? "Real（真实调用）" : "部分 / 全部 Mock"}
            </span>
          </div>
          <p className="founder-ai-meta">
            后端地址：http://127.0.0.1:8000/api/v1/connector · 只有 GPT Brain 与 Claude Code Executor 都就绪时，Sino 才会走真实链路；任何一个未就绪都会安全降级为标注了 Mock 的演示结果，不会假装已经真实执行。
          </p>
          <div className="founder-ai-actions">
            <button type="button" className="sf-button-primary" onClick={refresh} disabled={loading}>
              {loading ? "检测中…" : "重新检测"}
            </button>
          </div>
        </div>

        {error && (
          <div className="sf-card">
            <p className="founder-ai-meta" style={{ color: "var(--sf-danger, #e5484d)" }}>
              无法连接本地 backend：{error}。请确认已执行 `uv run uvicorn app.main:app --reload` 启动 backend（默认 http://127.0.0.1:8000）。
            </p>
          </div>
        )}

        {health && (
          <>
            <StatusRow
              label="GPT Brain（思考大脑）"
              ready={health.brain.ready}
              detail={{
                已配置: health.brain.configured ? "是" : "否",
                模型: health.brain.model,
                问题: health.brain.issue,
                修复方式: health.brain.fix_hint,
              }}
            />
            <StatusRow
              label="Claude Code Executor（执行者）"
              ready={health.executor.ready}
              detail={{
                CLI已安装: health.executor.cli_installed ? "是" : "否",
                已认证: health.executor.authenticated === null ? "未知" : health.executor.authenticated ? "是" : "否",
                工作目录: health.executor.workdir,
                问题: health.executor.issue,
                修复方式: health.executor.fix_hint,
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
