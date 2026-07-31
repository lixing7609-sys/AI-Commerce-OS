import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApiState } from "@sinofut/ui";
import { api, ARTICLE_CHANNELS, contentLifecycleLabel } from "@sinofut/domain";

// V2-002 §5.2: 图文/短视频/AI短剧/直播素材/数字人共用同一个启动器——
// 全部落地为无限画布上的内容节点，不是各自独立的编辑器。
export function ContentTypeLauncher({ contentType, showChannels = false }) {
  const { state, refresh } = useApiState();
  const [channel, setChannel] = useState(ARTICLE_CHANNELS[0]);
  const navigate = useNavigate();

  if (!state) return <p>加载中…</p>;

  const effectiveType = showChannels ? channel : contentType;
  const existing = state.content.filter((c) => (c.contentType || "短视频") === effectiveType);

  const launch = async (strategyId) => {
    await api.createContent(strategyId, effectiveType);
    refresh();
    navigate("/canvas");
  };

  return (
    <div>
      <div className="sf-page-header">
        <h1>{contentType}</h1>
        <p>选择一个已生成策略的机会，创建「{effectiveType}」内容任务，随即进入无限画布继续生产。</p>
      </div>

      {showChannels && (
        <div className="studio-channel-chips">
          {ARTICLE_CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              className={`sf-icon-button${c === channel ? " is-active" : ""}`}
              style={c === channel ? { borderColor: "var(--ai-accent)", color: "var(--ai-accent)" } : undefined}
              onClick={() => setChannel(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="sf-grid sf-grid-2">
        <div className="sf-card">
          <h3>可用策略</h3>
          {state.strategies.map((s) => (
            <div key={s.id} className="sf-opportunity-item">
              <h4>{s.hypothesis}</h4>
              <button type="button" className="sf-button-primary" onClick={() => launch(s.id)}>
                创建「{effectiveType}」内容任务
              </button>
            </div>
          ))}
          {state.strategies.length === 0 && (
            <p style={{ color: "var(--text-tertiary)" }}>暂无策略，请先在 Founder · 增长网络生成策略</p>
          )}
        </div>

        <div className="sf-card">
          <h3>已创建的 {effectiveType}</h3>
          {existing.map((c) => (
            <div key={c.id} className="sf-opportunity-item">
              <h4>{c.title}</h4>
              <span className="sf-badge">{contentLifecycleLabel(c.stage)}</span>
            </div>
          ))}
          {existing.length === 0 && <p style={{ color: "var(--text-tertiary)" }}>暂无</p>}
        </div>
      </div>
    </div>
  );
}
