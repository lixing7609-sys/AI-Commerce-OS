import { FounderComposer } from "./FounderComposer.jsx";
import { NavIcon } from "./icons.jsx";
import { MultiModelBlock } from "./timeline-cards/MultiModelBlock.jsx";
import { DecisionDraftCard } from "./timeline-cards/DecisionDraftCard.jsx";
import { TaskPackageCard } from "./timeline-cards/TaskPackageCard.jsx";
import { ExecutionResultCard } from "./timeline-cards/ExecutionResultCard.jsx";
import { RetrospectiveCard } from "./timeline-cards/RetrospectiveCard.jsx";
import { KnowledgeCard } from "./timeline-cards/KnowledgeCard.jsx";
import { MissionApprovalCard } from "../developer-os/MissionApprovalCard.jsx";

const FOUNDER_NAME = "立行";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "上午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const DAILY_BRIEFING_ITEMS = [
  {
    label: "今日最高优先事项",
    title: "锁定今天最重要的公司结果",
    detail: "告诉 Sino 目标、约束与截止时间，我会拆解判断并持续推进。",
  },
  {
    label: "待你决策",
    title: "暂无待处理决策",
    detail: "需要 Founder 拍板的事项会在这里置顶，并附上 COO 建议。",
  },
  {
    label: "Sino 建议",
    title: "从一个高杠杆问题开始",
    detail: "研究、判断、开发或执行都可以直接交给我。",
  },
];

function DailyBriefing({ compact = false }) {
  return (
    <div className={`founder-daily-briefing${compact ? " is-compact" : ""}`}>
      <div className="founder-daily-briefing-heading">
        <span className="founder-daily-briefing-eyebrow">SINO · COO DAILY BRIEFING</span>
        <h1>{getGreeting()}，{FOUNDER_NAME}</h1>
        <p>这是今天的经营驾驶舱。先对齐重点，再让 Sino 推动结果发生。</p>
      </div>
      <div className="founder-daily-briefing-grid">
        {DAILY_BRIEFING_ITEMS.map((item, index) => (
          <article key={item.label} className="founder-daily-briefing-card">
            <div className="founder-daily-briefing-card-topline">
              <span className="founder-daily-briefing-index">0{index + 1}</span>
              <span>{item.label}</span>
            </div>
            <h2>{item.title}</h2>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function FounderConversation({ conversation, onSend, onDecisionAction, onTaskPackageAction, onReviewAction, onMissionAction, onMissionRefresh }) {
  if (!conversation) {
    return (
      <section className="founder-conversation is-briefing">
        <div className="founder-conversation-empty">
          <DailyBriefing />
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
            <DailyBriefing compact />
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
                <div key={entry.id} className="founder-conversation-bubble role-sino">
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
              return <ExecutionResultCard key={entry.id} entry={entry} onReview={onReviewAction} />;
            case "retrospective":
              return <RetrospectiveCard key={entry.id} entry={entry} />;
            case "knowledge":
              return <KnowledgeCard key={entry.id} entry={entry} />;
            case "developer-mission-approval":
              return <MissionApprovalCard key={entry.id} entry={entry} onAction={onMissionAction} onRefresh={onMissionRefresh} />;
            default:
              return null;
          }
        })}
      </div>
      <FounderComposer onSend={onSend} />
    </section>
  );
}
