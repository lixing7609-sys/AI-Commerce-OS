import Sidebar from "../components/layout/Sidebar";
import DeliverableCenterContent from "./DeliverableCenterContent";

/**
 * Developer 版外壳，内容部分见 DeliverableCenterContent.jsx
 * （阶段：Founder Operator Edition 抽取，逻辑不变，见该文件顶部
 * 注释）。
 */
function DeliverableCenter({ onNavigate = () => {}, onNavigateToTask = () => {}, selectedDeliverableId = null }) {
  return (
    <div className="dashboard-shell">
      <Sidebar activePage="deliverables" onNavigate={onNavigate} />
      <main className="dashboard-workspace">
        <DeliverableCenterContent
          onNavigateToTask={onNavigateToTask}
          selectedDeliverableId={selectedDeliverableId}
        />
      </main>
    </div>
  );
}

export default DeliverableCenter;
