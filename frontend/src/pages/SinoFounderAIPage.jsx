import { FounderSinoPanel } from "../console/modules/founderWorkbench/FounderSinoPanel.jsx";
import "./sino-founder-ai.css";

export default function SinoFounderAIPage() {
  return (
    <div className="sino-founder-page">
      <aside className="sino-founder-page__nav">
        <div className="sino-founder-page__brand">Sino<br /><span>Founder AI</span></div>
        <nav aria-label="Sino Navigation">
          <a className="active" href="/founder/sino">工作台</a>
          <a href="/founder/sino#conversations">对话</a>
          <a href="/founder/sino#tasks">任务资产</a>
          <a href="/founder/sino#artifacts">成果资产</a>
          <a href="/founder/sino#memory">记忆</a>
        </nav>
        <div className="sino-founder-page__nav-foot">Founder System<br /><small>协调模式 · 需授权执行</small></div>
      </aside>

      <main className="sino-founder-page__main">
        <header className="sino-founder-page__header">
          <div><span className="eyebrow">Founder AI · Development Orchestrator</span><h1>和 Sino 一起完成工作</h1></div>
          <span className="status-dot">● 在线</span>
        </header>
        <div className="sino-founder-page__conversation"><FounderSinoPanel /></div>
        <section className="sino-founder-page__timeline" aria-label="Execution Timeline">
          <div className="timeline-title">Execution Timeline</div>
          <div className="timeline-steps"><span className="active">目标</span><span>分析</span><span>任务草稿</span><span>授权</span><span>执行</span><span>成果</span></div>
        </section>
      </main>

      <aside className="sino-founder-page__context">
        <h2>Context Panel</h2>
        <dl>
          <div><dt>系统</dt><dd>Founder AI</dd></div>
          <div><dt>Conversation</dt><dd>当前会话</dd></div>
          <div><dt>TaskAsset</dt><dd>待生成</dd></div>
          <div><dt>Approval</dt><dd>需要 Founder 授权</dd></div>
          <div><dt>Execution</dt><dd>未执行</dd></div>
        </dl>
        <p className="sino-founder-page__guard">Sino 负责理解、规划与调度。Codex 仅在授权后执行。</p>
      </aside>
    </div>
  );
}
