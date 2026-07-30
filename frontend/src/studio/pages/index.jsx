import { OverviewPage } from "./OverviewPage.jsx";
import { SecretaryPage } from "./SecretaryPage.jsx";
import { HotspotAnalysisPage, TrendForecastPage, TopicPoolPage } from "./HotspotPages.jsx";
import { ContentProjectsPage } from "./ContentPages.jsx";
import { GraphicContentEditorPage } from "./GraphicContentPages.jsx";
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
import { WorkspacePage } from "./WorkspacePage.jsx";
import { ShortDramaWorkbench } from "./ShortDramaWorkbench.jsx";
import { AiImageWorkbench } from "./AiImageWorkbench.jsx";
import { AiVideoWorkbench } from "./AiVideoWorkbench.jsx";
import { AiArticleWorkbench } from "./AiArticleWorkbench.jsx";
import { AiLiveWorkbench } from "./AiLiveWorkbench.jsx";
import { AiAudioWorkbench } from "./AiAudioWorkbench.jsx";
import { PublishingCenterPage } from "./PublishingCenterPage.jsx";
import { AssetLibraryPage } from "./AssetLibraryPage.jsx";
import { BrandAssetsPage } from "./BrandAssetsPage.jsx";
import { AnalyticsWorkbench } from "./AnalyticsWorkbench.jsx";
import { SettingsWorkbench } from "./SettingsWorkbench.jsx";

/**
 * 模块 key -> 渲染函数的唯一映射. StudioApp.jsx 和 Founder Studio Lab
 * （console/labs/StudioLabConnected.jsx）从这里查表渲染当前页面。
 *
 * Founder Master Edition Charter §3.4 收口后的 13 个顶级子项在前半
 * 段；每一个都是组合/复用页面，不是新写的业务逻辑（AI Article/AI
 * Audio 两个例外——之前没有对应实现，是真正新建的，见各自文件顶部
 * 注释）。旧的 36 个子项 key 全部在下半段保留映射，逐一对应到吸收
 * 它的新组合页面（或原样保留，如 matrixAccounts），不会 404：
 *
 *   secretary/overview/contentProjects/hotspotAnalysis/trendForecast/
 *     topicPool → Workspace
 *   graphicContent/graphicContentEditor → AI Image
 *   aiVideo/scriptStoryboard/mediaGeneration/aiEditing → AI Video
 *     （script/storyboard/generation/editing 也是 AI Short Drama 的
 *     阶段，见 DirectorWorkspace 内部十阶段——独立 key 仍指向各自
 *     原有的独立编辑页面，不是被这两个 Workbench 遮蔽）
 *   aiLive/liveCommerce → AI Live
 *   shortDrama/director/characterScene/contentReview → AI Short Drama
 *   voiceSubtitleBgm → AI Audio
 *   matrixPublish/trafficPool/adResources/adOrders → Publishing Center
 *   contentAssets/marketplace → Asset Library
 *   brandGuidelines/brandDeals/ipLicensing → Brand Assets
 *   dataAnalytics/monetizationCenter/revenueShare/knowledgeProducts/
 *     computeTasks → Analytics
 *   studioSettings/platformConnections/notificationsPermissions →
 *     Settings
 */
export const PAGE_COMPONENTS = {
  // ---- 13 个 Charter 冻结的顶级子项 ----
  workspace: ({ navigate }) => <WorkspacePage navigate={navigate} />,
  graphicContent: ({ navigate }) => <AiImageWorkbench navigate={navigate} />,
  aiVideo: () => <AiVideoWorkbench />,
  aiArticle: () => <AiArticleWorkbench />,
  aiLive: () => <AiLiveWorkbench />,
  shortDrama: ({ navigate }) => <ShortDramaWorkbench navigate={navigate} />,
  aiAudio: () => <AiAudioWorkbench />,
  matrixAccounts: () => <MatrixAccountsPage />,
  publishingCenter: () => <PublishingCenterPage />,
  assetLibrary: () => <AssetLibraryPage />,
  brandAssets: () => <BrandAssetsPage />,
  analytics: ({ navigate }) => <AnalyticsWorkbench navigate={navigate} />,
  settings: () => <SettingsWorkbench />,

  // ---- 旧 key，保留可解析（见上方映射表），不再是侧边栏顶级子项 ----
  secretary: ({ navigate }) => <SecretaryPage navigate={navigate} />,
  overview: ({ navigate }) => <OverviewPage navigate={navigate} />,
  hotspotAnalysis: ({ navigate }) => <HotspotAnalysisPage navigate={navigate} />,
  trendForecast: () => <TrendForecastPage />,
  topicPool: ({ navigate }) => <TopicPoolPage navigate={navigate} />,
  contentProjects: ({ navigate }) => <ContentProjectsPage navigate={navigate} />,
  scriptStoryboard: ({ navigate, params }) => <ScriptStoryboardPage navigate={navigate} params={params} />,
  characterScene: () => <CharacterScenePage />,
  mediaGeneration: () => <MediaGenerationPage />,
  aiEditing: () => <AiEditingPage />,
  voiceSubtitleBgm: () => <VoiceSubtitleBgmPage />,
  contentReview: () => <ContentReviewPage />,
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

  // ---- 详情/工作台页面 ----
  director: ({ navigate, params }) => <DirectorWorkspace navigate={navigate} params={params} />,
  graphicContentEditor: ({ navigate, params }) => <GraphicContentEditorPage navigate={navigate} params={params} />,
};
