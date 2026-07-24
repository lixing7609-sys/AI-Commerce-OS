import Sidebar from "../components/layout/Sidebar";
import ShopCenterContent from "./ShopCenterContent";

/**
 * Developer 版外壳，内容部分见 ShopCenterContent.jsx（阶段：
 * Founder Operator Edition 抽取，逻辑不变，见该文件顶部注释）。
 */
function ShopCenter({ onNavigate = () => {} }) {
  return (
    <div className="dashboard-shell">
      <Sidebar activePage="shops" onNavigate={onNavigate} />
      <main className="dashboard-workspace">
        <ShopCenterContent />
      </main>
    </div>
  );
}

export default ShopCenter;
