import { useState } from "react";

import BusinessResultDetail from "../components/BusinessResultDetail";
import DevInfoCollapse from "../components/DevInfoCollapse";
import { usePreview } from "../helpers/previewContextCore";
import { demoAiTeam, demoDeliverables, demoSecretaryWork } from "../previewData";
import { getBusinessTitle } from "../helpers/formatters";

const TABS = [
  { key: "waiting", label: "等待我处理" },
  { key: "in_progress", label: "进行中" },
  { key: "completed", label: "已完成" },
  { key: "error", label: "异常" },
  { key: "team", label: "AI团队" },
];

function shopNameOf(shops, shopId) {
  if (!shopId) return "全部店铺";
  const shop = shops.find((item) => (item.id ?? item.shop_code) === shopId);
  return shop ? shop.name ?? shop.shop_name : "未知店铺";
}

function WaitingTab({ items, shops, showPrototypeNotice }) {
  if (items.length === 0) {
    return <div className="op-empty-state">暂无等待处理的事项。</div>;
  }
  return (
    <div className="op-work-list">
      {items.map((item) => (
        <article className="op-work-card" key={item.id}>
          <h4>{getBusinessTitle(item)}</h4>
          <p className="op-work-meta">
            {shopNameOf(shops, item.shopId)} · {item.agent}
          </p>
          <p>{item.summary}</p>
          <div className="op-card-actions">
            <button type="button" className="op-btn primary" onClick={() => showPrototypeNotice("批准")}>
              批准
            </button>
            <button type="button" className="op-btn" onClick={() => showPrototypeNotice("要求补充")}>
              要求补充
            </button>
            <button type="button" className="op-btn" onClick={() => showPrototypeNotice("暂不处理")}>
              暂不处理
            </button>
          </div>
          <DevInfoCollapse fields={[["Task ID", item.devTaskId]]} />
        </article>
      ))}
    </div>
  );
}

function InProgressTab({ items, shops }) {
  if (items.length === 0) {
    return <div className="op-empty-state">当前没有进行中的工作。</div>;
  }
  return (
    <div className="op-work-list">
      {items.map((item) => (
        <article className="op-work-card" key={item.id}>
          <h4>{getBusinessTitle(item)}</h4>
          <p className="op-work-meta">
            {shopNameOf(shops, item.shopId)} · {item.agent}
          </p>
          <ol className="op-progress-steps inline">
            {item.progressSteps.map((step, index) => (
              <li key={step} className={index < item.currentStep ? "done" : index === item.currentStep ? "active" : "pending"}>
                <span className="op-progress-dot" />
                {step}
              </li>
            ))}
          </ol>
          <DevInfoCollapse fields={[["Task ID", item.devTaskId]]} />
        </article>
      ))}
    </div>
  );
}

function CompletedTab({ items, shops, onOpenDetail }) {
  if (items.length === 0) {
    return <div className="op-empty-state">今天还没有已完成的工作。</div>;
  }
  return (
    <div className="op-work-list">
      {items.map((item) => (
        <article className="op-work-card clickable" key={item.id} onClick={() => onOpenDetail(item)}>
          <h4>{getBusinessTitle(item)}</h4>
          <p className="op-work-meta">
            {shopNameOf(shops, item.shopId)} · {item.agent} · {item.completedAt}
          </p>
          <p>{item.conclusion}</p>
          <button type="button" className="op-link-button">
            {item.nextStep} →
          </button>
        </article>
      ))}
    </div>
  );
}

function ErrorTab({ items, shops, showPrototypeNotice }) {
  if (items.length === 0) {
    return <div className="op-empty-state">当前没有异常。</div>;
  }
  return (
    <div className="op-work-list">
      {items.map((item) => (
        <article className="op-work-card error" key={item.id}>
          <h4>{getBusinessTitle(item)}</h4>
          <p className="op-work-meta">{shopNameOf(shops, item.shopId)}</p>
          <p>
            <strong>发生了什么：</strong>
            {item.title}
          </p>
          <p>
            <strong>对经营的影响：</strong>
            {item.impact}
          </p>
          <p>
            <strong>建议操作：</strong>
            {item.suggestion}
          </p>
          <div className="op-card-actions">
            <button type="button" className="op-btn primary" onClick={() => showPrototypeNotice("去处理")}>
              去处理
            </button>
          </div>
          <DevInfoCollapse fields={[["Task ID", item.devTaskId], ["技术错误", item.devError]]} />
        </article>
      ))}
    </div>
  );
}

function TeamTab({ team }) {
  return (
    <div className="op-team-grid">
      {team.map((member) => (
        <article className="op-team-card" key={member.name}>
          <div className="op-team-header">
            <strong>{member.name}</strong>
            <span className={`op-team-status ${member.busy ? "busy" : "idle"}`}>
              {member.busy ? "忙碌中" : "空闲"}
            </span>
          </div>
          <p className="op-team-role">负责：{member.responsibility}</p>
          <p>今天做了什么：{member.todayDone}</p>
          <p>最近完成：{member.recentCompleted}</p>
          <p>能接受的任务：{member.canAccept.join("、")}</p>
          <DevInfoCollapse
            fields={[
              ["capability_ready", "true"],
              ["provider", "deepseek"],
            ]}
          />
        </article>
      ))}
    </div>
  );
}

function SecretaryPage({ initialDetail }) {
  const { shops, showPrototypeNotice } = usePreview();
  const [activeTab, setActiveTab] = useState(initialDetail?.kind === "work" ? "completed" : "waiting");
  const [detailItem, setDetailItem] = useState(() => {
    if (initialDetail?.kind === "work") {
      return demoSecretaryWork.find((item) => item.id === initialDetail.id) ?? null;
    }
    return null;
  });

  const byStatus = (status) => demoSecretaryWork.filter((item) => item.status === status);

  function openDetail(workItem) {
    setDetailItem(workItem);
  }

  if (detailItem) {
    const deliverable = demoDeliverables.find((d) => d.id === detailItem.deliverableId);
    const resultItem = deliverable
      ? {
          title: detailItem.title,
          typeLabel: deliverable.typeLabel,
          type: deliverable.type,
          agent: detailItem.agent,
          conclusion: detailItem.conclusion,
          content: deliverable.content,
          devTaskId: detailItem.devTaskId,
        }
      : {
          title: detailItem.title,
          agent: detailItem.agent,
          conclusion: detailItem.conclusion,
          content: null,
          devTaskId: detailItem.devTaskId,
        };

    return (
      <div className="op-page">
        <BusinessResultDetail
          item={resultItem}
          shopName={shopNameOf(shops, detailItem.shopId)}
          onBack={() => setDetailItem(null)}
          backLabel="返回AI秘书处"
        />
      </div>
    );
  }

  return (
    <div className="op-page">
      <header className="op-page-header">
        <div>
          <h1>AI秘书处</h1>
          <p>查看AI今天正在做什么、已经完成什么，以及哪些事项等待你决定。</p>
        </div>
      </header>

      <div className="op-tab-bar">
        {TABS.map((tab) => (
          <button
            type="button"
            key={tab.key}
            className={`op-tab-button${activeTab === tab.key ? " active" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "waiting" && (
        <WaitingTab items={byStatus("waiting")} shops={shops} showPrototypeNotice={showPrototypeNotice} />
      )}
      {activeTab === "in_progress" && <InProgressTab items={byStatus("in_progress")} shops={shops} />}
      {activeTab === "completed" && (
        <CompletedTab items={byStatus("completed")} shops={shops} onOpenDetail={openDetail} />
      )}
      {activeTab === "error" && (
        <ErrorTab items={byStatus("error")} shops={shops} showPrototypeNotice={showPrototypeNotice} />
      )}
      {activeTab === "team" && <TeamTab team={demoAiTeam} />}
    </div>
  );
}

export default SecretaryPage;
