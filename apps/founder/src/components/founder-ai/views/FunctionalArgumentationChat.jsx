import { useEffect, useRef, useState } from "react";
import { useFounderAI } from "../useFounderAI.js";
import { ARGUMENTATION_TEMPLATES } from "../mockData.js";

const QUESTIONS = [
  { key: "target", text: "这个功能主要服务 Founder、Operator、Studio 还是 Operator Cloud？" },
  { key: "userProblem", text: "它解决的核心用户问题是什么？" },
  { key: "businessValue", text: "它是否能带来收入、效率提升或成本下降？" },
  { key: "existingSimilar", text: "是否已有相似能力？" },
  { key: "dependencies", text: "实现需要哪些 Agent、Workflow、Connector 或数据？" },
];

const CONCLUSIONS = ["通过", "有条件通过", "暂缓", "否决"];

function buildResult(idea, answers) {
  const len = idea.trim().length;
  const conclusion = CONCLUSIONS[len % CONCLUSIONS.length];
  return {
    title: idea.trim().slice(0, 40) || "未命名功能",
    userProblem: answers.userProblem || "—",
    targetUser: answers.target || "—",
    coreValue: answers.userProblem ? `帮助${answers.target || "相关主体"}解决：${answers.userProblem}` : "—",
    businessValue: answers.businessValue || "—",
    feasibility: len > 20 ? "技术可行性较高，可复用现有 Agent/Connector 基础设施" : "技术可行性中等，需要先做小范围技术预研",
    systemDependency: answers.dependencies || "—",
    risk: conclusion === "否决" ? "高" : conclusion === "暂缓" ? "中" : "低",
    conclusion,
    nextStep:
      conclusion === "通过"
        ? "先在 Founder 自己的经营场景中连续验证 7 天，达标后再开放给 Operator"
        : conclusion === "有条件通过"
          ? "先补充关键假设验证，再决定是否投入开发"
          : conclusion === "暂缓"
            ? "暂不投入，等待更明确的信号后重新论证"
            : "不建议投入，已有更优先级的替代方案",
  };
}

// 功能论证的对话式流程 —— 与 ChatThread 使用相同的气泡视觉语言，但内部维护
// 自己的多轮追问状态机（第 0 步收集想法，1~5 步逐一追问，第 6 步生成结果）。
export function FunctionalArgumentationChat({ conversation, onAppendMessage }) {
  const { addArgumentation, addExecutionTask, addDecisionMemory, addPendingDecision } = useFounderAI();
  const userMessages = conversation.messages.filter((m) => m.role === "user");
  const isComplete = userMessages.length >= QUESTIONS.length + 1;
  // 论证一旦完成（想法 + 5 个追问都已回答），即使离开对话再回来，也要能从
  // 已持久化的消息记录里还原出 idea/answers/result —— 结构化结果不应该只
  // 活在组件的本地 state 里，否则切换对话/刷新页面后结果卡片会消失。
  const reconstructedAnswers = isComplete
    ? QUESTIONS.reduce((acc, q, i) => ({ ...acc, [q.key]: userMessages[i + 1]?.text || "" }), {})
    : {};
  const [stepIndex, setStepIndex] = useState(Math.min(userMessages.length, QUESTIONS.length + 1));
  const [idea, setIdea] = useState(userMessages[0]?.text || "");
  const [answers, setAnswers] = useState(reconstructedAnswers);
  const [input, setInput] = useState("");
  const [result, setResult] = useState(() => (isComplete ? buildResult(userMessages[0]?.text || "", reconstructedAnswers) : null));
  const [savedNote, setSavedNote] = useState("");
  const introAppendedRef = useRef(false);

  // 当对话是从「普通对话」经 SinoFUT 意图建议切换过来的（已有一条用户消息，
  // 但还没问过第一条追问），补一条衔接语，避免流程断层。用"是否已经问过
  // 第一个问题"而不是"sino 消息数是否为 0"来判断——切换模式本身也会追加
  // 一条"已切换为…模式"的 sino 消息，如果只看数量会误判为"已经问过"。
  useEffect(() => {
    const hasAskedFirstQuestion = conversation.messages.some((m) => m.role === "sino" && m.text.includes(QUESTIONS[0].text));
    if (idea && !hasAskedFirstQuestion && stepIndex === 1 && !introAppendedRef.current) {
      introAppendedRef.current = true;
      onAppendMessage(conversation.id, { role: "sino", text: `好的，我们逐步来判断「${idea}」是否值得做。${QUESTIONS[0].text}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submitIdea(value) {
    const text = value.trim();
    if (!text) return;
    setIdea(text);
    onAppendMessage(conversation.id, { role: "user", text });
    onAppendMessage(conversation.id, { role: "sino", text: `好的，我们逐步来判断「${text}」是否值得做。${QUESTIONS[0].text}` });
    setStepIndex(1);
    setInput("");
  }

  function submitAnswer(e) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    const question = QUESTIONS[stepIndex - 1];
    onAppendMessage(conversation.id, { role: "user", text });
    const nextAnswers = { ...answers, [question.key]: text };
    setAnswers(nextAnswers);
    setInput("");

    if (stepIndex < QUESTIONS.length) {
      onAppendMessage(conversation.id, { role: "sino", text: QUESTIONS[stepIndex].text });
      setStepIndex(stepIndex + 1);
    } else {
      const built = buildResult(idea, nextAnswers);
      onAppendMessage(conversation.id, { role: "sino", text: "已完成论证，结果如下：" });
      addArgumentation(built);
      setResult(built);
      setStepIndex(QUESTIONS.length + 1);
    }
  }

  function handleAction(action) {
    if (!result) return;
    switch (action) {
      case "dev-task":
        addExecutionTask({
          name: `开发任务：${result.title}`,
          source: "功能论证",
          executor: "Founder",
          stage: "执行中",
          progress: 0,
          doneSummary: "刚从功能论证生成",
          blockers: "无",
          nextStep: "拆解具体开发子任务",
          needsReauthorization: false,
        });
        setSavedNote("已生成开发任务，可在「执行跟踪」查看");
        break;
      case "adr":
        addDecisionMemory({ content: `ADR：${result.title} —— ${result.conclusion}`, source: "功能论证", scope: "架构" });
        setSavedNote("已建立 ADR 记录，可在「决策记忆」查看");
        break;
      case "capability-center":
        setSavedNote("已交给能力中心（演示状态，未跳转页面）");
        break;
      case "pending-decision":
        addPendingDecision({
          title: `是否推进「${result.title}」`,
          source: "功能论证",
          impact: result.businessValue,
          aiSuggestion: `建议结论：${result.conclusion}`,
          riskLevel: result.risk,
        });
        setSavedNote("已加入「待决策」");
        break;
      case "decision-memory":
        addDecisionMemory({ content: `功能论证结论：${result.title} —— ${result.conclusion}`, source: "功能论证", scope: "产品" });
        setSavedNote("已保存到「决策记忆」");
        break;
      default:
        break;
    }
  }

  return (
    <div className="founder-ai-chat-thread">
      <div className="founder-ai-chat-header">
        <h1>{conversation.title === "新对话" ? "功能论证" : conversation.title}</h1>
        <span className="sf-badge">功能论证</span>
      </div>

      <div className="founder-ai-chat-scroll">
        {stepIndex === 0 && (
          <>
            <div className="founder-ai-chat-bubble role-sino">你想论证什么功能或想法？</div>
            <div className="studio-channel-chips">
              {ARGUMENTATION_TEMPLATES.map((t) => (
                <button key={t} type="button" className="sf-icon-button" onClick={() => submitIdea(t)}>
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        {conversation.messages.map((m) => (
          <div key={m.id} className={`founder-ai-chat-bubble role-${m.role}`}>
            {m.text}
          </div>
        ))}

        {result && (
          <div className="sf-card founder-ai-argument-result">
            <div className="founder-ai-row-header">
              <h3>{result.title}</h3>
              <span className={`sf-badge ${result.conclusion === "通过" ? "success" : result.conclusion === "否决" ? "danger" : "warn"}`}>
                建议结论：{result.conclusion}
              </span>
            </div>
            <dl className="founder-ai-definition-grid">
              <dt>用户问题</dt>
              <dd>{result.userProblem}</dd>
              <dt>使用对象</dt>
              <dd>{result.targetUser}</dd>
              <dt>核心价值</dt>
              <dd>{result.coreValue}</dd>
              <dt>商业价值</dt>
              <dd>{result.businessValue}</dd>
              <dt>实现难度</dt>
              <dd>{result.feasibility}</dd>
              <dt>系统依赖</dt>
              <dd>{result.systemDependency}</dd>
              <dt>风险</dt>
              <dd>{result.risk}</dd>
              <dt>建议结论</dt>
              <dd>{result.conclusion}</dd>
              <dt>下一步行动</dt>
              <dd>{result.nextStep}</dd>
            </dl>
            <div className="founder-ai-actions">
              <button type="button" className="sf-button-primary" onClick={() => handleAction("dev-task")}>
                生成开发任务
              </button>
              <button type="button" className="sf-icon-button" onClick={() => handleAction("adr")}>
                建立 ADR
              </button>
              <button type="button" className="sf-icon-button" onClick={() => handleAction("capability-center")}>
                交给能力中心
              </button>
              <button type="button" className="sf-icon-button" onClick={() => handleAction("pending-decision")}>
                加入待决策
              </button>
              <button type="button" className="sf-icon-button" onClick={() => handleAction("decision-memory")}>
                保存到决策记忆
              </button>
            </div>
            {savedNote && <p className="founder-ai-saved-note">{savedNote}</p>}
          </div>
        )}
      </div>

      {stepIndex === 0 && (
        <form className="founder-ai-chat-composer" onSubmit={(e) => { e.preventDefault(); submitIdea(input); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="直接输入你想论证的功能或想法……" />
          <button type="submit" className="sf-button-primary">
            发送
          </button>
        </form>
      )}
      {stepIndex > 0 && stepIndex <= QUESTIONS.length && (
        <form className="founder-ai-chat-composer" onSubmit={submitAnswer}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="输入你的回答……" />
          <button type="submit" className="sf-button-primary">
            发送
          </button>
        </form>
      )}
    </div>
  );
}
