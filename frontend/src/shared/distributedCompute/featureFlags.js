/**
 * 分布式算力 Feature Flag（阶段：四端产品体系 V1，§6 硬性要求：
 * "distributedCompute.enabled = false，默认必须关闭"）。
 *
 * 这是本轮唯一一个真正的"总开关"——Cloud/Studio/Operator 三端的
 * 分布式算力相关页面全部只读展示 mock 数据，页面里的任何按钮
 * （暂停/继续/取消任务等）都只修改 mock 仓库里的展示状态，不触发
 * 任何真实调度；但即便如此，所有会展示"当前是否启用"的地方都必须
 * 从这里读取同一个值，不允许各页面各自写死文案，避免文案和实际
 * 开关状态不一致。
 *
 * 单设备的参与策略（ComputeParticipationPolicy.enabled）是第二层
 * 开关，语义是"如果平台总开关未来打开了，这台设备是否参与"——两层
 * 开关任一为 false，这台设备都不会真正参与调度。
 */
export const FEATURE_FLAGS = Object.freeze({
  distributedCompute: {
    enabled: false,
  },
});

export function isDistributedComputeEnabled() {
  return FEATURE_FLAGS.distributedCompute.enabled === true;
}

/**
 * 唯一允许"看起来在执行分布式任务"的入口都必须先经过这个守卫——
 * 本轮所有 mock 操作（暂停/继续/取消）都调用它，即使目前守卫内部
 * 什么也不做（因为总开关恒为 false，调用方在开关关闭时应该直接
 * 走"未启用"分支，根本不会走到真正派发任务这一步）。保留这个函数
 * 是为了在未来真正接入调度时，有一个唯一、显式、可审计的检查点，
 * 而不是分散在各处零散判断。
 */
export function assertDistributedComputeAllowed() {
  if (!isDistributedComputeEnabled()) {
    throw new Error(
      "distributedCompute.enabled is false — 分布式算力尚未启用，不允许派发任何真实任务。"
    );
  }
}
