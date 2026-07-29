import {
  OverviewPage,
  OperatorsPage,
  DevicesPage,
  LicensesPage,
  TokenMeteringPage,
  OtaSupportPage,
  DistributedSchedulingPage,
} from "./cloudPages.jsx";

/**
 * key -> 渲染函数的唯一映射（阶段 Founder Full-System v3 Batch 2
 * §2）——和 operator-preview/pageRegistry.jsx 同一个原则：页面组件
 * 本体在 cloudPages.jsx 里（该文件只导出组件，满足 react-refresh 的
 * Fast Refresh 要求），这里只做 key -> 组件的映射，供独立 `/cloud`
 * 应用（CloudConsoleApp.jsx）和 Founder 的 Cloud Center
 * （console/labs/CloudCenterConnected.jsx）共用，key 必须和
 * navConfig.js 里的 NAV_ITEMS 完全对应。
 */
export const PAGE_COMPONENTS = {
  overview: ({ navigate }) => <OverviewPage navigate={navigate} />,
  operators: ({ navigate }) => <OperatorsPage navigate={navigate} />,
  devices: ({ params }) => <DevicesPage filterOperatorId={params.operatorId} />,
  licenses: () => <LicensesPage />,
  tokenMetering: () => <TokenMeteringPage />,
  otaSupport: () => <OtaSupportPage />,
  distributedScheduling: () => <DistributedSchedulingPage />,
};
