/**
 * Studio 专属领域概念（阶段：Studio V3 Integration）。跨端共享概念在
 * shared/domainTypes.js 里已经声明（ContentProject/ContentAsset/
 * MatrixAccount/TrafficResource/AdvertisingResource/AdvertisingOrder
 * 等）——本文件只补充"Studio 内容公司操作系统"内部才有、不需要被
 * Founder/Operator/Cloud 共享的更细粒度概念：生产流水线的阶段结构、
 * 剧本/分镜/角色、AI图文的结构化内容块、Founder Studio 实验室用到的
 * Agent/Prompt/Skill/ModelRoute、以及商业经营的收入/损益结构。
 *
 * 本仓库是纯 JS，这里的 typedef 只声明字段形状，不含 mock 数据或
 * 业务逻辑——具体种子数据在 mock/ 目录下按文件生成。
 */

/**
 * @typedef {Object} TrendOpportunity
 * 一条跨平台热点/趋势条目——热点分析中心、Studio秘书首页选题建议共用
 * 同一个形状。
 * @property {string} trendId
 * @property {string} name
 * @property {string} sourcePlatform          抖音/小红书/视频号/快手/B站/微博/红果/番茄/TikTok/YouTube/搜索关键词/行业热点/商品相关
 * @property {number} heatScore                热度（0-100）
 * @property {number} growthRate                增长速度（百分比，可为负）
 * @property {"emerging"|"peaking"|"declining"} lifecyclePhase
 * @property {"low"|"medium"|"high"} competitionLevel
 * @property {string[]} suitableContentTypes    适配内容类型（含 graphic_content）
 * @property {string[]} suitableAccountIds      适配矩阵账号
 * @property {string} riskNote
 * @property {string} recommendedAngle          推荐切入角度
 * @property {number} estimatedTraffic
 * @property {string} estimatedMonetization
 * @property {boolean} suitableForGraphic        是否适合图文
 * @property {string[]} graphicPlatforms         推荐图文平台
 * @property {string[]} graphicFormats           推荐图文类型
 * @property {string[]} recommendedKeywords
 * @property {string} searchLifecycle
 * @property {number} savePotential               收藏潜力（0-100）
 * @property {number} sharePotential               转发潜力（0-100）
 * @property {number} privateTrafficPotential      私域沉淀潜力（0-100）
 * @property {string} recommendedTitleDirection
 * @property {string} recommendedGraphicForm
 */

/**
 * @typedef {Object} WorkflowStage
 * 生产流水线单个阶段——短剧/短视频/直播共用 10 阶段结构，AI图文使用
 * 独立的 14 阶段结构（GRAPHIC_WORKFLOW_STAGES）。
 * @property {string} stageKey
 * @property {number} order
 * @property {string} name
 * @property {string} agentName                负责 Agent
 * @property {"pending"|"in_progress"|"completed"|"locked"} status
 * @property {string} promptVersion
 * @property {string} skillUsed
 * @property {string} modelUsed
 * @property {number} tokenCost
 * @property {number} computeCost
 * @property {string} lastRunAt
 * @property {string[]} runLog
 */

/**
 * @typedef {Object} Script
 * @property {string} scriptId
 * @property {string} projectId
 * @property {string} genre
 * @property {string} coreConflict
 * @property {string} characterRelations
 * @property {string} worldSetting
 * @property {string} synopsis
 * @property {string} episodeStructure
 * @property {string} characterArc
 * @property {string} emotionCurve
 * @property {string} hookPerEpisode
 * @property {string} endingSuspense
 * @property {string} platformFit
 * @property {string} monetizationGoal
 * @property {number} version
 */

/**
 * @typedef {Object} Shot
 * 分镜工作台/AI导演工作台共用的单个镜头。
 * @property {string} shotId
 * @property {string} projectId
 * @property {number} order
 * @property {string} shotType            镜头类型（女主近景/双人对峙/文件特写…）
 * @property {string} shotSize            景别
 * @property {string} description         画面描述
 * @property {string[]} characters
 * @property {string} action
 * @property {string} expression
 * @property {string} dialogue
 * @property {string} narration
 * @property {string} cameraMovement
 * @property {number} durationSeconds
 * @property {string} scene
 * @property {string} lighting
 * @property {string} style
 * @property {string} aspectRatio
 * @property {string} generationModel
 * @property {number} cost
 * @property {number} consistencyScore
 * @property {string} platformRisk
 * @property {string} agentSuggestion
 * @property {"draft"|"generated"|"locked"} status
 */

/**
 * @typedef {Object} CharacterVersion
 * @property {string} characterId
 * @property {string} name
 * @property {number} age
 * @property {string} appearance
 * @property {string} costume
 * @property {string} personality
 * @property {string} background
 * @property {string[]} expressionSet
 * @property {string[]} actionSet
 * @property {string} voiceProfile
 * @property {string} referenceImage
 * @property {string} consistencyId
 * @property {boolean} crossShotConsistent
 * @property {boolean} crossEpisodeConsistent
 * @property {number} version
 */

/**
 * @typedef {Object} StudioAgent
 * Founder Studio 实验室的 Agent 矩阵条目——内容生产 14 个 + 图文
 * 生产/运营 13 个，共 27 个角色化 Agent。
 * @property {string} agentId
 * @property {string} name
 * @property {string} responsibility
 * @property {"idle"|"running"|"completed"|"needs_attention"|"error"} status
 * @property {string} currentTask
 * @property {number} progress
 * @property {string} primaryModel
 * @property {string} backupModel
 * @property {string} promptVersion
 * @property {string[]} skillCombo
 * @property {string} workflow
 * @property {string[]} toolPermissions
 * @property {string} lastRunAt
 * @property {number} cost
 * @property {number} successRate
 * @property {number} latencyMs
 * @property {boolean} needsHumanIntervention
 */

/**
 * @typedef {Object} AgentRun
 * @property {string} runId
 * @property {string} agentId
 * @property {string} taskSummary
 * @property {string} input
 * @property {string} output
 * @property {number} tokenCost
 * @property {number} durationMs
 * @property {"success"|"failed"|"needs_review"} result
 * @property {string} runAt
 */

/**
 * @typedef {Object} PromptVersion
 * @property {string} promptId
 * @property {string} agentId
 * @property {number} version
 * @property {"draft"|"published"|"deprecated"} status
 * @property {string} content
 * @property {string} note
 * @property {string} publishedAt
 * @property {string} publishedBy
 */

/**
 * @typedef {Object} SkillVersion
 * @property {string} skillId
 * @property {string} name
 * @property {string} domainKnowledge
 * @property {string} workSteps
 * @property {string} outputTemplate
 * @property {string} prohibitions
 * @property {string} qualityRules
 * @property {string[]} callableTools
 * @property {string} example
 * @property {number} version
 * @property {string[]} applicableAgentIds
 */

/**
 * @typedef {Object} ModelRoute
 * @property {string} agentId
 * @property {string} primaryModel
 * @property {string} backupModel
 * @property {string} imageModel
 * @property {string} videoModel
 * @property {string} voiceModel
 * @property {number} maxTokens
 * @property {number} temperature
 * @property {number} timeoutSeconds
 * @property {number} retryCount
 * @property {number} perCallCostLimit
 * @property {number} dailyCostLimit
 * @property {boolean} autoSwitchModel
 * @property {string} fallbackStrategy
 */

/**
 * @typedef {Object} GraphicContentProject
 * AI图文一级内容形态的项目单元——与短剧/视频/直播平级，不是
 * ContentProject 的附属字段。
 * @property {string} projectId
 * @property {string} name
 * @property {string} graphicType    小红书图文/公众号文章/知乎回答/头条文章/商品种草图文/商品详情图文/品牌故事/行业分析/知识科普/SEO文章/信息长图/漫画图文/多平台图文矩阵…
 * @property {string|null} ipId
 * @property {string|null} relatedProductId
 * @property {string|null} relatedTrendId
 * @property {string} stage           14 阶段 workflow 的当前 stageKey
 * @property {string} ownerAgentOrPerson
 * @property {string[]} targetPlatforms
 * @property {string} monetizationModel
 * @property {number} tokenUsed
 * @property {number} computeUnitsUsed
 * @property {number} budget
 * @property {"planning"|"in_production"|"in_review"|"published"|"archived"} status
 * @property {string} expectedCompleteAt
 */

/**
 * @typedef {Object} ArticleBrief
 * @property {string} projectId
 * @property {string} targetAudience
 * @property {string} contentGoal
 * @property {string} toneOfVoice
 * @property {string} keySellingPoints
 * @property {string} referenceCompetitors
 */

/**
 * @typedef {Object} ArticleOutline
 * @property {string} projectId
 * @property {string[]} sections
 * @property {string} narrativeOrder
 */

/**
 * @typedef {Object} ContentBlock
 * AI图文编辑画布的最小可编辑单元——正文由这些结构化块组成，不是
 * 一整段不可编辑的字符串。
 * @property {string} blockId
 * @property {string} projectId
 * @property {number} order
 * @property {"heading"|"paragraph"|"quote"|"list"|"table"|"image"|"infographic"|"product-card"|"data-card"|"callout"|"CTA"|"separator"} type
 * @property {string} text
 * @property {string} tone
 * @property {number} length
 * @property {string[]} keywords
 * @property {number} seoWeight
 * @property {string} platformStyle
 * @property {boolean} keepBrandTone
 * @property {boolean} allowExaggeration
 * @property {string} sourceRef
 * @property {string} imageRequirement
 * @property {string} imageRatio
 * @property {string} imageStyle
 * @property {string} generationModel
 * @property {string} complianceRisk
 * @property {number} duplicateRate
 * @property {string} aiSuggestion
 * @property {number} generationCost
 * @property {boolean} locked
 */

/**
 * @typedef {Object} PlatformArticleVariant
 * 同一母稿在不同平台的独立版本——各自可编辑/预览/审核/发布/看数据。
 * @property {string} variantId
 * @property {string} projectId
 * @property {"xiaohongshu"|"wechat"|"zhihu"|"toutiao"|"product_seeding"} platform
 * @property {string} title
 * @property {string} coverTitle
 * @property {string[]} tags
 * @property {string} summary
 * @property {"draft"|"in_review"|"approved"|"published"} status
 * @property {string} publishedAt
 */

/**
 * @typedef {Object} SEOKeyword
 * @property {string} keyword
 * @property {number} searchVolume
 * @property {number} rankingPosition
 * @property {string} intent
 */

/**
 * @typedef {Object} GraphicPublishTask
 * @property {string} taskId
 * @property {string} projectId
 * @property {string} variantId
 * @property {string} platform
 * @property {string} accountId
 * @property {string} scheduledAt
 * @property {"scheduled"|"publishing"|"published"|"failed"} status
 * @property {number} retryCount
 * @property {string} contentUrl
 * @property {"pending"|"synced"} dataSyncStatus
 */

/**
 * @typedef {Object} GraphicContentMetrics
 * @property {string} projectId
 * @property {string} variantId
 * @property {number} impressions
 * @property {number} reads
 * @property {number} clickRate
 * @property {number} avgReadDuration
 * @property {number} completionRate
 * @property {number} saves
 * @property {number} likes
 * @property {number} comments
 * @property {number} shares
 * @property {number} newFollowers
 * @property {number} searchEntries
 * @property {number} keywordRanking
 * @property {number} privateTrafficImported
 * @property {number} productClicks
 * @property {number} conversions
 */

/**
 * @typedef {Object} GraphicRevenueEntry
 * @property {string} entryId
 * @property {string} projectId
 * @property {string} category   图文平台分成/公众号流量主/头条百家号阅读收益/知乎内容收益/小红书品牌合作/图文种草订单/软文广告/商品带货/私域获客/付费文章/专栏/电子书/课程导流/品牌内容代运营/图文版权授权/信息图与报告销售
 * @property {number} revenue
 * @property {number} generationCost
 * @property {number} imageCost
 * @property {number} distributionCost
 * @property {number} adCost
 * @property {number} grossMargin
 * @property {string} settlementStatus
 */

/**
 * @typedef {Object} RevenueEntry
 * 商业变现中心的通用收入条目——覆盖平台分成/品牌合作/带货直播/知识
 * 产品/版权授权五大类，图文收入条目复用同一形状（见
 * GraphicRevenueEntry，字段超集）。
 * @property {string} entryId
 * @property {string} projectId
 * @property {"platform_share"|"brand_deal"|"live_commerce"|"knowledge_product"|"ip_licensing"} category
 * @property {string} subCategory     红果/番茄/B站创作激励/视频号/YouTube/课程/会员/剧本授权…
 * @property {number} revenue
 * @property {string} settlementStatus
 * @property {string} recordedAt
 */

/**
 * @typedef {Object} ProjectEconomics
 * 单项目损益——收入、模型成本、广告成本、人工成本占位、毛利、ROI。
 * @property {string} projectId
 * @property {number} revenue
 * @property {number} modelCost
 * @property {number} adCost
 * @property {number} laborCostPlaceholder
 * @property {number} grossProfit
 * @property {number} roi
 * @property {number} pendingSettlement
 * @property {number} settled
 */

/**
 * @typedef {Object} PlatformSettlement
 * @property {string} settlementId
 * @property {string} platform
 * @property {string} period
 * @property {number} grossRevenue
 * @property {number} platformFee
 * @property {number} netRevenue
 * @property {"pending"|"partially_settled"|"settled"} status
 */

export const GRAPHIC_TYPE = "graphic_content";
