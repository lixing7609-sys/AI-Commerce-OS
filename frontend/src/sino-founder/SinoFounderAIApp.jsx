import { ConversationWorkspace } from "./ConversationWorkspace.jsx";
import "./sino-founder-ai.css";

export default function SinoFounderAIApp() {
  return (
    <div className="sino-app">
      <aside className="sino-sidebar">
        <a className="sino-brand" href="/founder/sino"><span>S</span><div>Sino<strong>Founder AI</strong></div></a>
        <div className="sino-sidebar__label">Workspace</div>
        <nav aria-label="Sino Founder AI">
          <a href="#overview" className="is-active"><span>01</span>今日驾驶舱</a>
          <a href="#strategy"><span>02</span>战略与路线</a>
          <a href="#system-builder"><span>03</span>系统构建器</a>
          <a href="#conversation"><span>04</span>目标推理</a>
          <a href="#execution"><span>05</span>执行中心</a>
          <a href="#knowledge"><span>06</span>资产与记忆</a>
        </nav>
        <div className="sino-approval-note"><i /><div><strong>Approval first</strong><small>所有执行与提交均由 Founder 授权</small></div></div>
        <footer>AI Commerce OS<br /><small>Founder orchestration layer</small></footer>
      </aside>
      <ConversationWorkspace />
    </div>
  );
}
