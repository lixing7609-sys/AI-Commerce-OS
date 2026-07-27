import "../../../App.css";
import ShopCenterContent from "../../../pages/ShopCenterContent.jsx";
import { STORE_DETAIL_EXTRA_TABS } from "./storeDetailExtraTabs.jsx";

/**
 * 复用 ShopCenterContent（真实店铺 CRUD/OAuth/凭据/连接测试逻辑
 * 完全不变），只在 Founder 控制台外壳内渲染内容部分——不再嵌入
 * ShopCenter.jsx 自带的 Sidebar，消除双重导航。App.css 只在进入
 * 本模块时按需加载，供 ShopCenterContent 内部沿用的既有类名使用。
 *
 * 阶段 Founder Store Center IA 精修：之前把"统一平台连接器"做成
 * 店铺中心顶部一个独立面板，一次性平铺展示所有店铺的连接状态——
 * 但连接器的凭据、健康度、同步状态、支持能力天然属于"具体某个
 * 店铺"，不应该脱离店铺详情单独存在。现在改为店铺详情页里
 * 「链接与授权」和「任务」之间的「平台连接器」标签页，进入某个
 * 店铺才能看到、管理这个店铺自己的连接器（见
 * mock/platformConnectorMock.js 的 getStoreConnectorState(shop)，
 * 按真实 shop.id 懒加载/持久化，不再是脱离店铺上下文的全局面板）。
 * 不修改 ShopCenterContent 本身的默认行为——extraDetailTabs 是可选
 * 参数，Developer 版的 ShopCenter.jsx 不传，标签页列表不变。
 */
export function StoreCenterModule() {
  return <ShopCenterContent extraDetailTabs={STORE_DETAIL_EXTRA_TABS} />;
}
