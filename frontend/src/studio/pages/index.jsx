import { OverviewPage } from "./OverviewPage.jsx";
import { SecretaryPage } from "./SecretaryPage.jsx";
import { ContentProjectsPage, ShortDramaPage, AiVideoPage, AiLivePage } from "./ContentPages.jsx";
import { MatrixAccountsPage, ContentAssetsPage } from "./MatrixAssetPages.jsx";
import { TrafficPoolPage, AdResourcesPage, AdOrdersPage } from "./TrafficAdPages.jsx";
import { ComputeTasksPage, DataAnalyticsPage, SettingsPage } from "./PlatformPages.jsx";
import { MarketplaceBrowser } from "../../shared/marketplace/MarketplaceBrowser.jsx";

/**
 * 模块 key -> 渲染函数的唯一映射，StudioApp.jsx 从这里查表渲染当前
 * 页面——与 Founder 的 console/moduleRegistry.jsx、Operator 的
 * pageRegistry.jsx、Cloud 内联映射同一个原则，key 必须和
 * navConfig.js 里的 NAV_ITEMS 完全对应。
 */
export const PAGE_COMPONENTS = {
  secretary: ({ navigate }) => <SecretaryPage navigate={navigate} />,
  overview: ({ navigate }) => <OverviewPage navigate={navigate} />,
  contentProjects: () => <ContentProjectsPage />,
  shortDrama: () => <ShortDramaPage />,
  aiVideo: () => <AiVideoPage />,
  aiLive: () => <AiLivePage />,
  matrixAccounts: () => <MatrixAccountsPage />,
  contentAssets: () => <ContentAssetsPage />,
  trafficPool: () => <TrafficPoolPage />,
  adResources: () => <AdResourcesPage />,
  adOrders: () => <AdOrdersPage />,
  computeTasks: () => <ComputeTasksPage />,
  dataAnalytics: () => <DataAnalyticsPage />,
  marketplace: () => <MarketplaceBrowser theme="studio" />,
  settings: () => <SettingsPage />,
};
