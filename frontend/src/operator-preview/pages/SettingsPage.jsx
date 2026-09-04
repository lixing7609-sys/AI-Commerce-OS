import { useEffect, useState } from "react";

import { usePreview } from "../helpers/previewContextCore";
import {
  fetchRealKnowledgeDocuments,
  fetchRealLlmStatus,
  fetchRealRuntimeStatus,
} from "../helpers/realDataApi";
import { NOT_CONNECTED_LABEL } from "../helpers/formatters";
import { SETTINGS_GROUPS as GROUPS } from "../helpers/settingsGroups";

function SettingsPage() {
  const { showPrototypeNotice } = usePreview();
  const [activeGroup, setActiveGroup] = useState("model");
  const [llm, setLlm] = useState({ connected: false, status: null });
  const [runtime, setRuntime] = useState({ connected: false, status: null });
  const [docs, setDocs] = useState({ connected: false, items: [], categories: [] });

  useEffect(() => {
    fetchRealLlmStatus().then(setLlm);
    fetchRealRuntimeStatus().then(setRuntime);
    fetchRealKnowledgeDocuments().then(setDocs);
  }, []);

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>系统设置</h1>
          <p>开发与运维相关的技术设置，经营者日常操作不需要进入这里。</p>
        </div>
      </header>

      <div className="op-tab-bar wrap">
        {GROUPS.map((group) => (
          <button
            type="button"
            key={group.key}
            className={`op-tab-button${activeGroup === group.key ? " active" : ""}`}
            onClick={() => setActiveGroup(group.key)}
          >
            {group.label}
          </button>
        ))}
      </div>

      {activeGroup === "model" && (
        <div className="op-panel">
          <h3>AI模型</h3>
          {llm.connected ? (
            <dl className="op-detail-meta">
              <div>
                <dt>当前 Provider</dt>
                <dd>{llm.status.llm_provider ?? NOT_CONNECTED_LABEL}</dd>
              </div>
              <div>
                <dt>当前模型</dt>
                <dd>{llm.status.llm_model ?? NOT_CONNECTED_LABEL}</dd>
              </div>
              <div>
                <dt>DeepSeek 是否已配置</dt>
                <dd>{llm.status.deepseek_configured ? "是" : "否"}</dd>
              </div>
              <div>
                <dt>Ollama 是否可达</dt>
                <dd>{llm.status.ollama_reachable ? "是" : "否"}</dd>
              </div>
              <div>
                <dt>是否就绪</dt>
                <dd>{llm.status.llm_ready ? "是" : "否"}</dd>
              </div>
            </dl>
          ) : (
            <p className="op-empty-inline">{NOT_CONNECTED_LABEL}，已安全降级，不影响页面浏览。</p>
          )}
        </div>
      )}

      {activeGroup === "runtime" && (
        <div className="op-panel">
          <h3>系统运行</h3>
          {runtime.connected ? (
            <>
              <dl className="op-detail-meta">
                <div>
                  <dt>Runtime</dt>
                  <dd>{runtime.status.running ? "运行中" : "已停止"}</dd>
                </div>
                <div>
                  <dt>Consumer</dt>
                  <dd>
                    {runtime.status.consumer?.running ? "运行中" : "已停止"} ·{" "}
                    {runtime.status.consumer?.healthy ? "健康" : "异常"}
                  </dd>
                </div>
                <div>
                  <dt>自动恢复</dt>
                  <dd>{runtime.status.auto_resume_enabled ? "已开启" : "已关闭"}</dd>
                </div>
              </dl>
              <div className="op-card-actions">
                <button type="button" className="op-btn" onClick={() => showPrototypeNotice("启动")}>
                  启动
                </button>
                <button type="button" className="op-btn" onClick={() => showPrototypeNotice("停止")}>
                  停止
                </button>
              </div>
            </>
          ) : (
            <p className="op-empty-inline">{NOT_CONNECTED_LABEL}，已安全降级，不影响页面浏览。</p>
          )}
        </div>
      )}

      {activeGroup === "automation" && (
        <div className="op-panel">
          <h3>自动化</h3>
          <dl className="op-detail-meta">
            <div>
              <dt>n8n</dt>
              <dd>统一任务入口 active · 状态查询 active</dd>
            </div>
            <div>
              <dt>工作流状态</dt>
              <dd>企业微信入口 inactive</dd>
            </div>
          </dl>
        </div>
      )}

      {activeGroup === "messaging" && (
        <div className="op-panel">
          <h3>消息入口</h3>
          <ul className="op-memory-summary-list">
            <li>企业微信</li>
            <li>微信（尚未接入）</li>
            <li>其它入口（尚未接入）</li>
          </ul>
        </div>
      )}

      {activeGroup === "security" && (
        <div className="op-panel">
          <h3>安全</h3>
          <p className="op-empty-inline">店铺凭据加密、访问控制等安全配置，详见后台开发文档。</p>
        </div>
      )}

      {activeGroup === "docs" && (
        <div className="op-panel">
          <h3>开发与文档</h3>
          <p className="op-empty-inline">
            Architecture、Engineering Standards、Specification、Glossary、ADR、Roadmap 等工程文档统一收纳在此，
            经营者主导航不再展示。
          </p>
          {docs.connected ? (
            <ul className="op-memory-summary-list">
              {docs.items.slice(0, 10).map((item) => (
                <li key={item.id}>
                  {item.title} <span>{item.category}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="op-empty-inline">{NOT_CONNECTED_LABEL}，已安全降级，不影响页面浏览。</p>
          )}
        </div>
      )}

      {activeGroup === "logs" && (
        <div className="op-panel">
          <h3>系统日志</h3>
          <p className="op-empty-inline">技术日志入口，供开发与运维排查问题使用。</p>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
