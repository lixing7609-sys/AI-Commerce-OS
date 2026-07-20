import { useEffect, useState } from "react";

import Sidebar from "../components/layout/Sidebar";
import RuntimeStatusPanel from "../components/runtime/RuntimeStatusPanel";
import {
  getIntegrationStatus,
  getLlmStatus,
  getSystemInfo,
} from "../services/settingsApi";

const PROVIDER_LABELS = {
  deepseek: "DeepSeek",
  ollama: "Ollama",
};

function formatDateTime(value) {
  if (!value) {
    return "暂无";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "暂无";
  }

  return date.toLocaleString();
}

const INTEGRATION_LABELS = {
  external_task_api_key_configured: "AI Commerce Task API Key",
  n8n_reachable: "n8n",
  wecom_configured: "企业微信",
  deepseek_configured: "DeepSeek",
  ollama_reachable: "Ollama",
};

const CONFIGURED_TEXT = {
  external_task_api_key_configured: ["已配置", "未配置"],
  n8n_reachable: ["已连接", "未连接"],
  wecom_configured: ["已配置", "未配置"],
  deepseek_configured: ["已配置", "未配置"],
  ollama_reachable: ["可用", "不可用"],
};

function Settings({ onNavigate = () => {} }) {
  const [integrationStatus, setIntegrationStatus] = useState(null);
  const [llmStatus, setLlmStatus] = useState(null);
  const [systemInfo, setSystemInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [integration, llm, system] = await Promise.all([
          getIntegrationStatus(),
          getLlmStatus(),
          getSystemInfo(),
        ]);

        if (cancelled) {
          return;
        }

        setIntegrationStatus(integration);
        setLlmStatus(llm);
        setSystemInfo(system);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error("设置数据加载失败：", err);
          setError(err.message || "设置数据加载失败");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    const timer = window.setInterval(loadData, 15000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="dashboard-shell">
      <Sidebar
        activePage="settings"
        onNavigate={onNavigate}
        statusLabel={error ? "设置数据异常" : "设置正常"}
        statusOk={!error}
      />

      <main className="dashboard-workspace task-workspace">
        <header className="workspace-header">
          <div>
            <h1>设置</h1>
            <p>敏感配置只能在服务器安全环境中修改，不会在本页面显示。</p>
          </div>
        </header>

        <div className="task-scroll-area">
          {error && <div className="task-error">{error}</div>}

          <article className="analytics-panel">
            <div className="panel-heading">
              <span>Runtime 设置</span>
            </div>
            <RuntimeStatusPanel />
          </article>

          <article className="analytics-panel">
            <div className="panel-heading">
              <span>集成状态</span>
            </div>

            {loading && !integrationStatus ? (
              <div className="task-loading">正在加载集成状态……</div>
            ) : !integrationStatus ? (
              <div className="task-empty">暂无数据</div>
            ) : (
              <div className="settings-status-grid">
                {Object.entries(INTEGRATION_LABELS).map(([key, label]) => {
                  const configured = Boolean(integrationStatus[key]);
                  const [onText, offText] = CONFIGURED_TEXT[key];

                  return (
                    <div className="settings-status-item" key={key}>
                      <span>{label}</span>
                      <em className={configured ? "running" : "waiting"}>
                        {configured ? onText : offText}
                      </em>
                    </div>
                  );
                })}
              </div>
            )}
          </article>

          <article className="analytics-panel">
            <div className="panel-heading">
              <span>LLM Gateway</span>
            </div>

            {loading && !llmStatus ? (
              <div className="task-loading">正在加载模型网关状态……</div>
            ) : !llmStatus ? (
              <div className="task-empty">暂无数据</div>
            ) : (
              <div className="settings-status-grid">
                <div className="settings-status-item">
                  <span>当前 Provider</span>
                  <em>{PROVIDER_LABELS[llmStatus.llm_provider] ?? "未配置"}</em>
                </div>
                <div className="settings-status-item">
                  <span>DeepSeek</span>
                  <em className={llmStatus.deepseek_configured ? "running" : "waiting"}>
                    {llmStatus.deepseek_configured ? "已配置" : "未配置"}
                  </em>
                </div>
                <div className="settings-status-item">
                  <span>Ollama</span>
                  <em className={llmStatus.ollama_reachable ? "running" : "waiting"}>
                    {llmStatus.ollama_reachable ? "可用" : "不可用"}
                  </em>
                </div>
                <div className="settings-status-item">
                  <span>当前模型</span>
                  <em>{llmStatus.llm_model ?? "暂无"}</em>
                </div>
                <div className="settings-status-item">
                  <span>网关就绪状态</span>
                  <em className={llmStatus.llm_ready ? "running" : "waiting"}>
                    {llmStatus.llm_ready ? "就绪" : "未就绪"}
                  </em>
                </div>
                <div className="settings-status-item">
                  <span>最近一次检查时间</span>
                  <em>{formatDateTime(llmStatus.checked_at)}</em>
                </div>
              </div>
            )}
          </article>

          <article className="analytics-panel">
            <div className="panel-heading">
              <span>系统信息</span>
            </div>

            {loading && !systemInfo ? (
              <div className="task-loading">正在加载系统信息……</div>
            ) : !systemInfo ? (
              <div className="task-empty">暂无数据</div>
            ) : (
              <div className="settings-status-grid">
                <div className="settings-status-item">
                  <span>后端版本</span>
                  <em>{systemInfo.backend_version}</em>
                </div>
                <div className="settings-status-item">
                  <span>数据库迁移版本</span>
                  <em>{systemInfo.database_migration_head ?? "未知"}</em>
                </div>
                <div className="settings-status-item">
                  <span>任务执行器</span>
                  <em className={systemInfo.consumer_healthy ? "running" : "waiting"}>
                    {systemInfo.consumer_healthy ? "健康" : "未运行"}
                  </em>
                </div>
                <div className="settings-status-item">
                  <span>运行环境</span>
                  <em>{systemInfo.environment}</em>
                </div>
                <div className="settings-status-item">
                  <span>AI 员工数量</span>
                  <em>{systemInfo.agent_count}</em>
                </div>
                <div className="settings-status-item">
                  <span>n8n workflow 数量</span>
                  <em>尚未接入</em>
                </div>
              </div>
            )}
          </article>
        </div>
      </main>
    </div>
  );
}

export default Settings;
