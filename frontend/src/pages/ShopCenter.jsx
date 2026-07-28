import Sidebar from "../components/layout/Sidebar";
import ShopCenterContent from "../shared/products/operator/ShopCenterContent.jsx";

/**
 * Developer 版外壳，内容部分见 shared/products/operator/
 * ShopCenterContent.jsx（阶段 M8：三端共用同一份实现，见该文件
 * 顶部注释）。
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
