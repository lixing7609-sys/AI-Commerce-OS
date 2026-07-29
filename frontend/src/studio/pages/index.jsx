import { OverviewPage } from "./OverviewPage.jsx";
import { SecretaryPage } from "./SecretaryPage.jsx";
import { HotspotAnalysisPage, TrendForecastPage, TopicPoolPage } from "./HotspotPages.jsx";
import { ContentProjectsPage, ShortDramaPage, AiVideoPage, AiLivePage } from "./ContentPages.jsx";
import { GraphicContentListPage, GraphicContentEditorPage } from "./GraphicContentPages.jsx";
import { DirectorWorkspace } from "./DirectorWorkspace.jsx";
import {
  ScriptStoryboardPage, CharacterScenePage, MediaGenerationPage, AiEditingPage,
  VoiceSubtitleBgmPage, ContentReviewPage,
} from "./CreationWorkbenchPages.jsx";
import { MatrixAccountsPage, ContentAssetsPage, MatrixPublishPage } from "./MatrixAssetPages.jsx";
import { TrafficPoolPage, AdResourcesPage, AdOrdersPage } from "./TrafficAdPages.jsx";
import {
  MonetizationCenterPage, RevenueSharePage, BrandDealsPage, LiveCommercePage,
  KnowledgeProductsPage, IpLicensingPage,
} from "./MonetizationPages.jsx";
import {
  ComputeTasksPage, DataAnalyticsPage, StudioSettingsPage, PlatformConnectionsPage,
  BrandGuidelinesPage, NotificationsPermissionsPage,
} from "./PlatformPages.jsx";
import { MarketplaceBrowser } from "../../shared/marketplace/MarketplaceBrowser.jsx";

/**
 * 模块 key -> 渲染函数的唯一映射（阶段：Studio V3 Integration）。
 * StudioApp.jsx 和 Founder Studio 实验室（console/labs/StudioLab.jsx）
 * 从这里查表渲染当前页面——与 Founder 的 console/moduleRegistry.jsx、
 * Operator 的 pageRegistry.jsx、Cloud 内联映射同一个原则，key 必须和
 * navConfig.js 里的 NAV_ITEMS 完全对应，两个 host 共用同一份映射，
 * 零分叉。
 */
export const PAGE_COMPONENTS = {
  secretary: ({ navigate }) => <SecretaryPage navigate={navigate} />,
  overview: ({ navigate }) => <OverviewPage navigate={navigate} />,

  hotspotAnalysis: ({ navigate }) => <HotspotAnalysisPage navigate={navigate} />,
  trendForecast: () => <TrendForecastPage />,
  topicPool: ({ navigate }) => <TopicPoolPage navigate={navigate} />,
  contentProjects: ({ navigate }) => <ContentProjectsPage navigate={navigate} />,

  shortDrama: () => <ShortDramaPage />,
  aiVideo: () => <AiVideoPage />,
  graphicContent: ({ navigate }) => <GraphicContentListPage navigate={navigate} />,
  aiLive: () => <AiLivePage />,
  scriptStoryboard: ({ navigate, params }) => <ScriptStoryboardPage navigate={navigate} params={params} />,
  characterScene: () => <CharacterScenePage />,
  mediaGeneration: () => <MediaGenerationPage />,
  aiEditing: () => <AiEditingPage />,
  voiceSubtitleBgm: () => <VoiceSubtitleBgmPage />,
  contentReview: () => <ContentReviewPage />,

  matrixAccounts: () => <MatrixAccountsPage />,
  matrixPublish: () => <MatrixPublishPage />,
  contentAssets: () => <ContentAssetsPage />,
  trafficPool: () => <TrafficPoolPage />,
  adResources: () => <AdResourcesPage />,
  adOrders: () => <AdOrdersPage />,

  monetizationCenter: ({ navigate }) => <MonetizationCenterPage navigate={navigate} />,
  revenueShare: () => <RevenueSharePage />,
  brandDeals: () => <BrandDealsPage />,
  liveCommerce: () => <LiveCommercePage />,
  knowledgeProducts: () => <KnowledgeProductsPage />,
  ipLicensing: () => <IpLicensingPage />,
  computeTasks: () => <ComputeTasksPage />,
  dataAnalytics: () => <DataAnalyticsPage />,
  marketplace: () => <MarketplaceBrowser theme="studio" />,

  studioSettings: () => <StudioSettingsPage />,
  platformConnections: () => <PlatformConnectionsPage />,
  brandGuidelines: () => <BrandGuidelinesPage />,
  notificationsPermissions: () => <NotificationsPermissionsPage />,

  director: ({ navigate, params }) => <DirectorWorkspace navigate={navigate} params={params} />,
  graphicContentEditor: ({ navigate, params }) => <GraphicContentEditorPage navigate={navigate} params={params} />,
};
