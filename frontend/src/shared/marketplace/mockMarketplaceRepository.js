import { createLocalRepository, simulateLatency, tagDemo } from "../localRepository.js";
import {
  PackageType,
  TargetProduct,
  ReviewState,
  ReleaseChannel,
  InstallationState,
  RiskLevel,
} from "./types.js";

/**
 * Marketplace 的 mock 领域数据（阶段 M8 §9/§10）。localStorage 持久化，
 * 和 shared/storePlatform、shared/distributedCompute 同一套约定——
 * 不是真实支付/结算系统，是"信息架构和领域模型正确"的可交互原型。
 * 种子数据故意覆盖 Operator/Studio/Shared 三种 targetProducts、
 * BUNDLE 在内的多种 packageType、draft 到 stable 的完整评审状态谱，
 * 这样 Marketplace 三端视图的过滤逻辑才有真实差异可验证。
 */

function developer(overrides) {
  return {
    developerId: "dev-founder-platform",
    displayName: "AI Commerce OS 平台自研",
    tier: "platform",
    contactEmail: "platform@ai-commerce-os.internal",
    joinedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function evaluationSummary(overrides) {
  return {
    evaluationScore: null,
    verifiedStoreCount: 0,
    verifiedContentProjectCount: 0,
    verifiedScenarios: [],
    lastVerifiedAt: null,
    ...overrides,
  };
}

function pkg(overrides) {
  return {
    id: overrides.id,
    name: overrides.name,
    slug: overrides.slug ?? overrides.id,
    summary: overrides.summary,
    description: overrides.description ?? overrides.summary,
    packageType: overrides.packageType,
    targetProducts: overrides.targetProducts,
    categories: overrides.categories ?? [],
    developer: overrides.developer ?? developer(),
    currentVersion: overrides.currentVersion ?? "1.0.0",
    releaseChannel: overrides.releaseChannel ?? ReleaseChannel.STABLE,
    status: overrides.status ?? ReviewState.APPROVED,
    pricingModel: overrides.pricingModel ?? { model: "free", priceRmb: 0, billingCycle: null, revenueShareToDeveloper: 0 },
    licensePolicy: overrides.licensePolicy ?? { scope: "per_operator", seatLimit: null, transferable: false, termsSummary: "每个 Operator/Studio 主体一份授权，不可转让" },
    tokenPolicy: overrides.tokenPolicy ?? { consumesToken: true, estimatedTokenPerRun: 200, note: null },
    dependencies: overrides.dependencies ?? [],
    modelRequirements: overrides.modelRequirements ?? ["claude-sonnet-5"],
    connectorRequirements: overrides.connectorRequirements ?? [],
    deviceRequirements: overrides.deviceRequirements ?? {
      targetProducts: overrides.targetProducts,
      minDeviceModel: ["Mac mini M2"],
      requiredConnectors: overrides.connectorRequirements ?? [],
      requiredModelProviders: overrides.modelRequirements ?? ["claude-sonnet-5"],
    },
    permissions: overrides.permissions ?? [],
    riskLevel: overrides.riskLevel ?? RiskLevel.LOW,
    evaluationSummary: overrides.evaluationSummary ?? evaluationSummary(),
    versions: overrides.versions ?? [
      { version: overrides.currentVersion ?? "1.0.0", releaseChannel: overrides.releaseChannel ?? ReleaseChannel.STABLE, changelog: "首个版本", publishedAt: "2026-06-01T00:00:00Z", isCurrent: true },
    ],
    installCount: overrides.installCount ?? 0,
    rating: overrides.rating ?? null,
    createdAt: overrides.createdAt ?? "2026-06-01T00:00:00Z",
    updatedAt: overrides.updatedAt ?? "2026-06-01T00:00:00Z",
  };
}

function seedPackages() {
  return [
    pkg({
      id: "pkg-ai-customer-service-staff",
      name: "AI 客服员工·日常应答",
      summary: "处理售前/售后日常咨询的完整 AI 员工，含话术库、升级人工规则",
      packageType: PackageType.AGENT,
      targetProducts: [TargetProduct.OPERATOR],
      categories: ["ai_staff", "customer_service_capability"],
      permissions: ["order.read", "customer.read", "message.write"],
      riskLevel: RiskLevel.LOW,
      pricingModel: { model: "subscription", priceRmb: 99, billingCycle: "month", revenueShareToDeveloper: 0 },
      evaluationSummary: evaluationSummary({ evaluationScore: 88, verifiedStoreCount: 3, verifiedScenarios: ["MODE_MOCK 演练", "MODE_LIVE_READONLY 只读同步"], lastVerifiedAt: "2026-07-20T00:00:00Z" }),
      installCount: 12,
      rating: 4.6,
    }),
    pkg({
      id: "pkg-product-listing-copy",
      name: "商品详情页文案生成 Skill",
      summary: "根据商品属性和店铺调性生成可直接发布的商品详情文案",
      packageType: PackageType.SKILL,
      targetProducts: [TargetProduct.OPERATOR],
      categories: ["product_capability"],
      permissions: ["product.read", "product.write"],
      riskLevel: RiskLevel.LOW,
      installCount: 27,
      rating: 4.8,
    }),
    pkg({
      id: "pkg-ad-budget-guardrail-policy",
      name: "广告预算护栏 Policy",
      summary: "限制单日广告超支比例，超阈值自动转人工审批，不自动追加预算",
      packageType: PackageType.POLICY,
      targetProducts: [TargetProduct.OPERATOR],
      categories: ["advertising_capability", "profit_capability"],
      riskLevel: RiskLevel.MEDIUM,
      tokenPolicy: { consumesToken: false, estimatedTokenPerRun: null, note: "纯规则判定，不调用模型" },
      installCount: 5,
      rating: 4.2,
    }),
    pkg({
      id: "pkg-live-commerce-bundle",
      name: "AI 直播带货完整方案",
      summary: "选品、排品、直播脚本、直播间控场、复盘一体的完整经营方案",
      packageType: PackageType.BUNDLE,
      targetProducts: [TargetProduct.OPERATOR],
      categories: ["live_commerce_capability", "full_solution"],
      dependencies: [{ packageId: "pkg-ai-customer-service-staff", name: "AI 客服员工·日常应答", versionRange: ">=1.0.0", optional: true }],
      pricingModel: { model: "subscription", priceRmb: 399, billingCycle: "month", revenueShareToDeveloper: 0 },
      riskLevel: RiskLevel.MEDIUM,
      installCount: 2,
      rating: 4.5,
    }),
    pkg({
      id: "pkg-topic-scout-agent",
      name: "选题雷达 Agent",
      summary: "扫描全网热点并结合账号定位给出可执行选题清单",
      packageType: PackageType.AGENT,
      targetProducts: [TargetProduct.STUDIO],
      categories: ["topic_agent"],
      permissions: ["content_project.read"],
      installCount: 19,
      rating: 4.7,
    }),
    pkg({
      id: "pkg-short-drama-script-workflow",
      name: "AI 短剧分集脚本 Workflow",
      summary: "从大纲到分集脚本、分镜提示词的完整生成流程",
      packageType: PackageType.WORKFLOW,
      targetProducts: [TargetProduct.STUDIO],
      categories: ["short_drama_capability", "script_agent", "storyboard_capability"],
      pricingModel: { model: "usage_based", priceRmb: 0, billingCycle: null, revenueShareToDeveloper: 0 },
      tokenPolicy: { consumesToken: true, estimatedTokenPerRun: 1500, note: "按分集计费，费用随集数增长" },
      riskLevel: RiskLevel.LOW,
      evaluationSummary: evaluationSummary({ evaluationScore: 91, verifiedContentProjectCount: 4, verifiedScenarios: ["MODE_MOCK 演练"], lastVerifiedAt: "2026-07-18T00:00:00Z" }),
      installCount: 8,
      rating: 4.9,
    }),
    pkg({
      id: "pkg-digital-human-live-agent",
      name: "数字人直播 Agent",
      summary: "驱动数字人形象完成常规直播讲解与互动应答",
      packageType: PackageType.AGENT,
      targetProducts: [TargetProduct.STUDIO],
      categories: ["digital_human_capability", "ai_live_capability"],
      connectorRequirements: ["digital-human-runtime"],
      riskLevel: RiskLevel.MEDIUM,
      installCount: 3,
      rating: 4.1,
    }),
    pkg({
      id: "pkg-matrix-account-health-knowledge",
      name: "矩阵账号健康度知识库",
      summary: "各平台账号限流/降权/恢复策略的结构化知识库",
      packageType: PackageType.KNOWLEDGE,
      targetProducts: [TargetProduct.STUDIO],
      categories: ["matrix_operation_capability"],
      tokenPolicy: { consumesToken: false, estimatedTokenPerRun: null, note: "静态知识库，检索不计费" },
      installCount: 14,
      rating: 4.4,
    }),
    pkg({
      id: "pkg-industry-knowledge-home-goods",
      name: "家居行业经营知识库",
      summary: "家居类目选品、定价、旺季节奏的行业知识库",
      packageType: PackageType.KNOWLEDGE,
      targetProducts: [TargetProduct.SHARED],
      categories: ["industry_knowledge"],
      tokenPolicy: { consumesToken: false, estimatedTokenPerRun: null, note: "静态知识库，检索不计费" },
      installCount: 9,
      rating: 4.3,
    }),
    pkg({
      id: "pkg-general-brand-voice-prompt",
      name: "品牌调性 Prompt 模板",
      summary: "统一店铺/账号内容语气的可配置 Prompt 模板，经营和内容场景通用",
      packageType: PackageType.PROMPT,
      targetProducts: [TargetProduct.SHARED],
      categories: ["ai_staff", "copywriting_agent"],
      installCount: 21,
      rating: 4.5,
    }),
    // 三个不同评审阶段的例子——Founder Marketplace 需要全部看到，
    // Operator/Studio Marketplace 只应该看到 status===APPROVED 的。
    pkg({
      id: "pkg-draft-refund-negotiator",
      name: "（草稿）退款协商 Agent",
      summary: "尚在开发中的自动化退款协商助手，未提交审核",
      packageType: PackageType.AGENT,
      targetProducts: [TargetProduct.OPERATOR],
      categories: ["customer_service_capability"],
      status: ReviewState.DRAFT,
      releaseChannel: ReleaseChannel.DRAFT,
      riskLevel: RiskLevel.HIGH,
      installCount: 0,
      rating: null,
    }),
    pkg({
      id: "pkg-in-review-price-optimizer",
      name: "（审核中）动态改价 Skill",
      summary: "已提交审核、尚未通过的自动改价能力，风险等级高，需重点审查权限范围",
      packageType: PackageType.SKILL,
      targetProducts: [TargetProduct.OPERATOR],
      categories: ["profit_capability"],
      status: ReviewState.IN_REVIEW,
      releaseChannel: ReleaseChannel.CANARY,
      permissions: ["product.write"],
      riskLevel: RiskLevel.HIGH,
      installCount: 0,
      rating: null,
    }),
    pkg({
      id: "pkg-third-party-livestream-analytics",
      name: "第三方·直播数据洞察",
      summary: "第三方开发者提交的直播间数据分析能力（示例：第三方开发者提交入口）",
      packageType: PackageType.SKILL,
      targetProducts: [TargetProduct.STUDIO],
      categories: ["ai_live_capability", "matrix_operation_capability"],
      developer: developer({ developerId: "dev-third-party-001", displayName: "灯塔数据工作室", tier: "verified_third_party", contactEmail: "hello@lighthouse-data.example" }),
      status: ReviewState.IN_REVIEW,
      pricingModel: { model: "subscription", priceRmb: 59, billingCycle: "month", revenueShareToDeveloper: 0.7 },
      installCount: 0,
      rating: null,
    }),
  ];
}

function seedState() {
  return {
    packages: seedPackages(),
    installations: {}, // packageId -> { state, installedAt, targetProduct }
  };
}

const repo = createLocalRepository("marketplace", seedState);

export function listPackages() {
  return tagDemo(repo.get().packages);
}

export function getPackageById(id) {
  const found = repo.get().packages.find((p) => p.id === id);
  return found ? tagDemo(found) : null;
}

export function getInstallation(packageId) {
  return repo.get().installations[packageId] ?? { state: InstallationState.NOT_INSTALLED, installedAt: null };
}

export function listInstallations() {
  return repo.get().installations;
}

export async function installPackage(packageId, targetProduct) {
  await simulateLatency();
  repo.update((state) => {
    state.installations[packageId] = { state: InstallationState.INSTALLED, installedAt: new Date().toISOString(), targetProduct };
    const target = state.packages.find((p) => p.id === packageId);
    if (target) target.installCount += 1;
    return state;
  });
  return getInstallation(packageId);
}

export async function uninstallPackage(packageId) {
  await simulateLatency();
  repo.update((state) => {
    delete state.installations[packageId];
    return state;
  });
  return getInstallation(packageId);
}

export async function setReviewState(packageId, nextStatus) {
  await simulateLatency();
  repo.update((state) => {
    const target = state.packages.find((p) => p.id === packageId);
    if (target) {
      target.status = nextStatus;
      target.updatedAt = new Date().toISOString();
    }
    return state;
  });
  return getPackageById(packageId);
}

export async function setReleaseChannel(packageId, channel) {
  await simulateLatency();
  repo.update((state) => {
    const target = state.packages.find((p) => p.id === packageId);
    if (target) {
      target.releaseChannel = channel;
      target.updatedAt = new Date().toISOString();
    }
    return state;
  });
  return getPackageById(packageId);
}

export async function publishNewVersion(packageId, { version, changelog }) {
  await simulateLatency();
  repo.update((state) => {
    const target = state.packages.find((p) => p.id === packageId);
    if (target) {
      target.versions = target.versions.map((v) => ({ ...v, isCurrent: false }));
      target.versions.push({ version, releaseChannel: target.releaseChannel, changelog, publishedAt: new Date().toISOString(), isCurrent: true });
      target.currentVersion = version;
      target.updatedAt = new Date().toISOString();
    }
    return state;
  });
  return getPackageById(packageId);
}

export async function rollbackToVersion(packageId, version) {
  await simulateLatency();
  repo.update((state) => {
    const target = state.packages.find((p) => p.id === packageId);
    if (target && target.versions.some((v) => v.version === version)) {
      target.versions = target.versions.map((v) => ({ ...v, isCurrent: v.version === version }));
      target.currentVersion = version;
      target.updatedAt = new Date().toISOString();
    }
    return state;
  });
  return getPackageById(packageId);
}

export const __TEST_ONLY__ = { seedPackages };
