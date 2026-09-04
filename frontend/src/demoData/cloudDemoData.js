/**
 * Cloud Center（10 页）演示数据入口。设备/OTA/许可证/节点调度已经
 * 通过 cloud/mock/cloudMock.js 的 devices/operators/licenses 互相
 * 共享 id（见该文件顶部注释）。Token 中心/版本管理/资产管理/系统
 * 监控/日志中心是 Founder 侧新增的组合页面，本轮改为统一从这里取
 * 同一个设备/Operator 锚点，而不是各自另起一份不相关的示例数据，
 * 使"同一设备在设备管理/OTA更新/许可证/Token中心/系统监控/日志
 * 中心显示相同的设备编号、Operator 和版本"这条要求成立。
 */
export {
  SHARED_DEMO_DEVICE_ID,
  getFeaturedDevice,
  getFeaturedOperatorFleetEntry,
} from "./sharedDemoEntities.js";

export { getCloudState, getOperator, getDevice, getDevicesForOperator, getLicenseForOperator, getCloudOverviewMetrics } from "../cloud/mock/cloudMock.js";
