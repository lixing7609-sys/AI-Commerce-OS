import { FounderComposer } from "./FounderComposer.jsx";
import { NavIcon } from "./icons.jsx";
import { MultiModelBlock } from "./timeline-cards/MultiModelBlock.jsx";
import { DecisionDraftCard } from "./timeline-cards/DecisionDraftCard.jsx";
import { TaskPackageCard } from "./timeline-cards/TaskPackageCard.jsx";
import { ExecutionResultCard } from "./timeline-cards/ExecutionResultCard.jsx";
import { RetrospectiveCard } from "./timeline-cards/RetrospectiveCard.jsx";
import { KnowledgeCard } from "./timeline-cards/KnowledgeCard.jsx";

const FOUNDER_NAME = "立行";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "上午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

export function FounderConversation({
  conversation,
  onSend,
  onDecisionAction,
  onTaskPackageAction,
  onReviewAction,
  onExecutionInput,
  onExecutionCancel,
}) {
  if (!conversation) {
    return (
      <section className="founder-conversation">
        <div className="founder-conversation-empty">
          <h1>
            {getGreeting()}，{FOUNDER_NAME}
          </h1>
          <p>新建一个对话，直接告诉 Sino 你想研究、判断、开发或执行什么。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="founder-conversation">
      <div className="founder-conversation-header">
        <h1>{conversation.title}</h1>
      </div>
      <div className="founder-conversation-scroll">
        {conversation.messages.length === 0 && (
          <div className="founder-conversation-empty-inline">
            <h2>
              {getGreeting()}，{FOUNDER_NAME}
            </h2>
            <p>今天想研究、判断、开发或执行什么？直接说就好，Sino 会自动判断当前处于哪个阶段。</p>
          </div>
        )}
        {conversation.messages.map((entry) => {
          switch (entry.type) {
            case "user":
              return (
                <div key={entry.id} className="founder-conversation-bubble role-user">
                  {entry.attachments?.length > 0 && (
                    <div className="founder-conversation-attachments">
                      {entry.attachments.map((a) => (
                        <span key={a.id} className="founder-composer-attachment-chip">
                          <NavIcon name={a.kind === "image" ? "image" : "paperclip"} />
                          {a.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {entry.text}
                </div>
              );
            case "sino":
              return (
                <div
                  key={entry.id}
                  className={`founder-conversation-bubble role-sino${entry.pending ? " is-pending" : ""}${entry.mock ? " is-mock" : ""}`}
                >
                  {entry.text}
                </div>
              );
            case "multi-model":
              return <MultiModelBlock key={entry.id} entry={entry} />;
            case "decision-draft":
              return <DecisionDraftCard key={entry.id} entry={entry} onAction={onDecisionAction} />;
            case "task-package":
              return <TaskPackageCard key={entry.id} entry={entry} onAction={onTaskPackageAction} />;
            case "execution":
              return (
                <ExecutionResultCard
                  key={entry.id}
                  entry={entry}
                  onReview={onReviewAction}
                  onProvideInput={onExecutionInput}
                  onCancel={onExecutionCancel}
                />
              );
            case "retrospective":
              return <RetrospectiveCard key={entry.id} entry={entry} />;
            case "knowledge":
              return <KnowledgeCard key={entry.id} entry={entry} />;
            default:
              return null;
          }
        })}
      </div>
      <FounderComposer onSend={onSend} />
    </section>
  );
}
