import "../../../App.css";
import ShopCenterContent from "../../../pages/ShopCenterContent.jsx";
import { PlatformConnectorPanel } from "./PlatformConnectorPanel.jsx";

/**
 * 复用 ShopCenterContent（真实店铺 CRUD/OAuth/凭据/连接测试逻辑
 * 完全不变），只在 Founder 控制台外壳内渲染内容部分——不再嵌入
 * ShopCenter.jsx 自带的 Sidebar，消除双重导航。App.css 只在进入
 * 本模块时按需加载，供 ShopCenterContent 内部沿用的既有类名使用。
 *
 * 阶段 Founder UX Review V4，P0-35：新增"统一平台连接器"面板——
 * 内容中心/AI直播中心/广告中心/订单中心/客服中心都共用同一份
 * 店铺-平台连接与能力矩阵，不在各自模块里各自维护一份平台授权
 * 记录。这里只是新增一个 Founder 专属的只读/演示面板，不修改
 * ShopCenterContent 本身（Developer 版继续复用，行为不变）。
 */
export function StoreCenterModule() {
  return (
    <div>
      <PlatformConnectorPanel />
      <ShopCenterContent />
    </div>
  );
}
