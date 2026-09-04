/**
 * 分布式算力领域模型（阶段：四端产品体系 V1 冻结，§6 硬性范围）。
 *
 * 未来 Operator Cloud 可以调度分散在各地经营者 Mac mini 的空闲算力，
 * 为 AI Commerce OS Studio 和整个平台执行任务。本轮只把这个能力
 * 写入架构：类型定义（本文件）、Feature Flag（featureFlags.js）、
 * Mock 数据与只读展示页面（Cloud 的"分布式调度"、Studio 的"算力
 * 任务"、Operator 的"设备资源"卡片）。不实现真正的远程调度——见
 * featureFlags.js 的 distributedCompute.enabled，默认关闭，本轮
 * 没有任何代码路径会在它为 false 时执行任务，也没有任何 UI 操作
 * 会绕过这个开关直接生效。
 *
 * 优先级模型（固定，平台任务永远不能抢占本地经营任务）：
 *   P0 本地安全与系统稳定
 *   P1 经营者实时经营任务
 *   P2 经营者后台任务
 *   P3 平台分布式任务
 *   P4 低优先级批处理任务
 */

export const COMPUTE_TASK_PRIORITIES = Object.freeze([
  { key: "p0_local_safety", label: "P0 本地安全与系统稳定", rank: 0 },
  { key: "p1_business_realtime", label: "P1 经营者实时经营任务", rank: 1 },
  { key: "p2_business_background", label: "P2 经营者后台任务", rank: 2 },
  { key: "p3_platform_distributed", label: "P3 平台分布式任务", rank: 3 },
  { key: "p4_low_priority_batch", label: "P4 低优先级批处理任务", rank: 4 },
]);

export const COMPUTE_TASK_TYPES = Object.freeze([
  { key: "video_transcode", label: "视频转码" },
  { key: "image_processing", label: "图片处理" },
  { key: "audio_processing", label: "音频处理" },
  { key: "content_vectorization", label: "内容向量化" },
  { key: "local_model_inference", label: "本地模型推理" },
  { key: "data_cleaning", label: "数据清洗" },
  { key: "non_realtime_generation", label: "非实时内容生成" },
  { key: "asset_preprocessing", label: "素材预处理" },
]);

/**
 * @typedef {Object} DeviceResourceProfile
 * 一台设备当前可参与分布式算力调度的资源快照——由设备本地的
 * Resource Monitor 上报（本轮为 mock，无真实上报链路）。
 * @property {string} deviceId
 * @property {number} cpuCores
 * @property {number} memoryTotal            单位 MB
 * @property {number} memoryAvailable        单位 MB
 * @property {number} storageAvailable       单位 GB
 * @property {"normal"|"warm"|"throttling"} thermalState
 * @property {"ac_power"|"battery"} powerState
 * @property {number} currentLoad             0-1，本地经营负载占用比例
 * @property {"online"|"offline"|"unstable"} networkState
 * @property {string} lastReportedAt
 */

/**
 * @typedef {Object} ComputeParticipationPolicy
 * 单台设备是否参与、以及参与到什么程度的策略——经营者可见、可控，
 * 默认必须是 enabled=false（见 featureFlags.js 的全局开关，两者
 * 是"总开关"和"单设备开关"的关系，任一个关闭都不会真正执行任务）。
 * @property {string} deviceId
 * @property {boolean} enabled
 * @property {string} policyVersion
 * @property {number} maxCpuPercent
 * @property {number} maxMemoryMB
 * @property {number} maxStorageGB
 * @property {{start: string, end: string}[]} allowedTimeWindows
 * @property {boolean} pauseWhenBusinessBusy    经营繁忙时暂停——平台任务永不抢占本地经营任务的具体机制之一
 * @property {boolean} pauseWhenThermalHigh
 * @property {boolean} pauseWhenOnBattery
 * @property {string[]} allowedTaskTypes         引用 COMPUTE_TASK_TYPES 的 key
 * @property {"active"|"paused"|"disabled"} policyStatus
 */

/**
 * @typedef {Object} ComputeTask
 * @property {string} taskId
 * @property {string} source                      发起方标识（如 studio-content-pipeline）
 * @property {"founder"|"cloud"|"operator"|"studio"} sourceProduct
 * @property {string} taskType                     引用 COMPUTE_TASK_TYPES 的 key
 * @property {string} priority                      引用 COMPUTE_TASK_PRIORITIES 的 key
 * @property {number} requiredCpu
 * @property {number} requiredMemory
 * @property {number} estimatedDuration             秒
 * @property {string} payloadReference               指向任务负载的引用，不直接携带原始数据
 * @property {"public"|"internal"|"restricted"} securityClass
 * @property {"queued"|"assigned"|"running"|"completed"|"failed"|"cancelled"} status
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ComputeAssignment
 * 一次任务到设备的分配——与 ComputeTask 是多对一（一个任务失败重试
 * 可能产生多条分配记录）。
 * @property {string} assignmentId
 * @property {string} taskId
 * @property {string} deviceId
 * @property {string} assignedAt
 * @property {string|null} startedAt
 * @property {string|null} completedAt
 * @property {"pending"|"running"|"completed"|"failed"|"rolled_back"} status
 * @property {number} progress                      0-100
 * @property {{cpuPercent: number, memoryMB: number}} resourceUsage
 * @property {string|null} errorCode
 */

/**
 * @typedef {Object} ComputeUsageRecord
 * 一次分配的实际资源消耗与云成本节省估算——用于 Cloud 侧"预计节省
 * 云端算力成本"的统计口径。
 * @property {string} deviceId
 * @property {string} taskId
 * @property {number} cpuSeconds
 * @property {number} memorySeconds
 * @property {number} storageRead              MB
 * @property {number} storageWrite             MB
 * @property {number} networkIn                MB
 * @property {number} networkOut               MB
 * @property {string} startedAt
 * @property {string} endedAt
 * @property {number} estimatedCloudCostSaved   人民币元，估算值
 */
