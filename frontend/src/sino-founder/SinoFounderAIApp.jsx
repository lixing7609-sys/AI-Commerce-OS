import { ConversationWorkspace } from "./ConversationWorkspace.jsx";
import "./sino-founder-ai.css";

export default function SinoFounderAIApp() {
  return (
    <div className="sino-app">
      <aside className="sino-sidebar"><a className="sino-brand" href="/founder/sino"><span>S</span><div>Sino<strong>Founder AI</strong></div></a><nav aria-label="Sino Founder AI"><a href="#conversation" className="is-active">对话工作区</a><a href="#briefing">项目简报</a><a href="#tasks">任务草稿</a><a href="#artifacts">成果资产</a><a href="#memory">长期记忆</a></nav><footer>Founder System<br /><small>Orchestrator · Approval first</small></footer></aside>
      <ConversationWorkspace />
    </div>
  );
}
