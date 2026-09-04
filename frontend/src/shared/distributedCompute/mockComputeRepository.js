import { createLocalRepository, simulateLatency, tagDemo } from "../localRepository.js";
import { isDistributedComputeEnabled } from "./featureFlags.js";
import { COMPUTE_TASK_PRIORITIES, COMPUTE_TASK_TYPES } from "./types.js";

/**
 * 分布式算力 Mock 仓库（阶段：四端产品体系 V1，§6/§7）。Cloud 的
 * "分布式调度"、Studio 的"算力任务"、Operator 的"设备资源"卡片
 * 共用同一份数据——同一台设备、同一个任务在三端看到的是同一条
 * 记录，只是各端 UI 呈现的详细程度不同（Operator 只显示简化摘要，
 * 不出现 ComputeAssignment/Sandbox/CPU Time Slice 等技术词）。
 *
 * 硬性约束（本文件的每一个"操作"函数都遵守）：
 *   - isDistributedComputeEnabled() 为 false 时（本轮恒为 false），
 *     任何"操作"函数都只允许修改 mock 展示状态，绝不实际派发/执行
 *     任务——这里没有,也不会有,一个真正的任务执行器可以被触发。
 *   - 不执行任意远程 Shell、不传输真实经营者数据、不建立跨租户
 *     原始数据共享、不做后台挖矿式逻辑、不让平台任务绕过任务沙箱
 *     （sandboxed: true 字段本身就是"必须经过沙箱"的静态声明）。
 */

const now = Date.now();

const DEVICE_POOL_SEED = [
  {
    deviceId: "mac-mini-op-0002",
    operatorName: "星辰家居贸易",
    region: "华东",
    cpuCores: 10,
    memoryTotal: 16384,
    memoryAvailable: 6200,
    storageAvailable: 180,
    thermalState: "normal",
    powerState: "ac_power",
    currentLoad: 0.32,
    networkState: "online",
    lastReportedAt: new Date(now - 3 * 60000).toISOString(),
  },
  {
    deviceId: "mac-mini-op-0003",
    operatorName: "海纳百货",
    region: "华南",
    cpuCores: 8,
    memoryTotal: 16384,
    memoryAvailable: 2100,
    storageAvailable: 40,
    thermalState: "warm",
    powerState: "ac_power",
    currentLoad: 0.71,
    networkState: "unstable",
    lastReportedAt: new Date(now - 26 * 3600000).toISOString(),
  },
  {
    deviceId: "mac-mini-op-0004",
    operatorName: "锦程国际贸易",
    region: "华北",
    cpuCores: 10,
    memoryTotal: 24576,
    memoryAvailable: 14200,
    storageAvailable: 320,
    thermalState: "normal",
    powerState: "ac_power",
    currentLoad: 0.08,
    networkState: "offline",
    lastReportedAt: new Date(now - 5 * 86400000).toISOString(),
  },
];

const PARTICIPATION_POLICY_SEED = DEVICE_POOL_SEED.map((device, index) => ({
  deviceId: device.deviceId,
  enabled: false, // 单设备开关同样默认关闭，与全局 Feature Flag 是两层独立开关
  policyVersion: "v0.1.0-draft",
  maxCpuPercent: 30,
  maxMemoryMB: 4096,
  maxStorageGB: 20,
  allowedTimeWindows: [{ start: "01:00", end: "06:00" }],
  pauseWhenBusinessBusy: true,
  pauseWhenThermalHigh: true,
  pauseWhenOnBattery: true,
  allowedTaskTypes: index === 1 ? [] : ["image_processing", "content_vectorization", "asset_preprocessing"],
  policyStatus: "disabled",
}));

const COMPUTE_TASK_SEED = [
  {
    taskId: "ctask-1001",
    source: "studio-shortdrama-pipeline",
    sourceProduct: "studio",
    taskType: "video_transcode",
    priority: "p3_platform_distributed",
    requiredCpu: 4,
    requiredMemory: 4096,
    estimatedDuration: 1800,
    payloadReference: "asset-ref://shortdrama/ep-12/raw-cut",
    securityClass: "internal",
    status: "queued",
    sandboxed: true,
    createdAt: new Date(now - 2 * 3600000).toISOString(),
  },
  {
    taskId: "ctask-1002",
    source: "studio-matrix-content-vectorize",
    sourceProduct: "studio",
    taskType: "content_vectorization",
    priority: "p4_low_priority_batch",
    requiredCpu: 2,
    requiredMemory: 2048,
    estimatedDuration: 600,
    payloadReference: "asset-ref://matrix/账号健康分析-批次-08",
    securityClass: "internal",
    status: "queued",
    sandboxed: true,
    createdAt: new Date(now - 5 * 3600000).toISOString(),
  },
  {
    taskId: "ctask-1003",
    source: "founder-benchmark-batch",
    sourceProduct: "founder",
    taskType: "local_model_inference",
    priority: "p4_low_priority_batch",
    requiredCpu: 6,
    requiredMemory: 8192,
    estimatedDuration: 3600,
    payloadReference: "asset-ref://benchmark/eval-set-14",
    securityClass: "restricted",
    status: "cancelled",
    sandboxed: true,
    createdAt: new Date(now - 30 * 3600000).toISOString(),
  },
];

const repository = createLocalRepository("distributedCompute.state", () => ({
  devicePool: DEVICE_POOL_SEED,
  participationPolicies: PARTICIPATION_POLICY_SEED,
  computeTasks: COMPUTE_TASK_SEED,
  globalPauseActive: true, // 恒为 true：Feature Flag 关闭期间，展示层也把"全局暂停"显示为已启用
}));

export { COMPUTE_TASK_PRIORITIES, COMPUTE_TASK_TYPES };

export function getDistributedComputeState() {
  return tagDemo(repository.get());
}

export function getComputeOverview() {
  const state = repository.get();
  const onlineDevices = state.devicePool.filter((d) => d.networkState === "online").length;
  const schedulableDevices = state.devicePool.filter(
    (d) => d.networkState === "online" && d.currentLoad < 0.5
  ).length;
  const availableCpu = state.devicePool
    .filter((d) => d.networkState === "online")
    .reduce((sum, d) => sum + d.cpuCores * (1 - d.currentLoad), 0);
  const availableMemory = state.devicePool
    .filter((d) => d.networkState === "online")
    .reduce((sum, d) => sum + d.memoryAvailable, 0);
  return tagDemo({
    registeredDevices: state.devicePool.length,
    onlineDevices,
    schedulableDevices,
    availableCpuCores: Math.round(availableCpu * 10) / 10,
    availableMemoryMB: availableMemory,
    activeTasks: state.computeTasks.filter((t) => t.status === "running" || t.status === "assigned").length,
    completedTasksToday: 0,
    failedTasks: state.computeTasks.filter((t) => t.status === "failed").length,
    estimatedCloudCostSavedRmb: 0, // 尚未启用，没有真实执行，节省成本恒为 0，不能编造
  });
}

export async function setGlobalPause(paused) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({ ...state, globalPauseActive: paused })).globalPauseActive;
}

export async function cancelComputeTask(taskId) {
  await simulateLatency(200, 400);
  return repository.update((state) => ({
    ...state,
    computeTasks: state.computeTasks.map((t) => (t.taskId === taskId ? { ...t, status: "cancelled" } : t)),
  }));
}

export { isDistributedComputeEnabled };
