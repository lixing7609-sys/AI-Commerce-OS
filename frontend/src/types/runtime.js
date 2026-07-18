/**
 * Runtime 相关的响应结构定义（JSDoc 类型）。
 *
 * 项目当前未启用 TypeScript（无 tsconfig，全部源码为 .js/.jsx），
 * 这里用 JSDoc typedef 记录与后端 RuntimeStatusResponse 完全一致的
 * 字段形状，供编辑器提示与代码阅读参考，不引入新的构建工具链。
 *
 * @typedef {Object} RuntimeAgentInfo
 * @property {string} name
 * @property {string} role
 * @property {string} description
 * @property {string} status
 * @property {string | null} current_task
 * @property {string | null} last_run_at
 * @property {string | null} last_error
 */

/**
 * @typedef {Object} RuntimeAgentsSummary
 * @property {number} total
 * @property {number} running
 * @property {number} idle
 * @property {number} stopped
 * @property {number} error
 * @property {RuntimeAgentInfo[]} items
 */

/**
 * 后台任务消费者（TaskConsumerService）的只读状态视图，与
 * GET /api/v1/runtime/status 响应中的 consumer 字段、以及独立的
 * GET /api/v1/runtime/consumer-status 完全一致。
 *
 * healthy 等价于 running：consumer loop 是否仍在正常执行、未意外
 * 退出。Runtime 手动 stop 后 consumer.running/healthy 通常仍为
 * true——消费循环随 backend 进程持续存活，只是不再领取新任务。
 * current_task_id 是"最近处理或正在处理的任务 ID"，不保证严格
 * 实时反映真正的 in-flight 任务。
 *
 * @typedef {Object} TaskConsumerStatusResponse
 * @property {boolean} running
 * @property {boolean} healthy
 * @property {boolean} stop_requested
 * @property {string | null} current_task_id
 * @property {number} processed_count
 * @property {number} completed_count
 * @property {number} failed_count
 * @property {number} conflict_count
 * @property {string | null} last_outcome
 * @property {string | null} last_error_type
 * @property {string | null} started_at
 * @property {string | null} stopped_at
 */

/**
 * @typedef {Object} RuntimeStatusResponse
 * @property {boolean} running
 * @property {string} status
 * @property {string | null} started_at
 * @property {string | null} stopped_at
 * @property {RuntimeAgentsSummary} agents
 * @property {string} desired_state
 * @property {string} actual_state
 * @property {boolean} auto_resume_enabled
 * @property {string | null} last_started_at
 * @property {string | null} last_stopped_at
 * @property {string | null} last_heartbeat_at
 * @property {string} last_shutdown_type
 * @property {string | null} last_error
 * @property {number} recovery_failure_count
 * @property {string} updated_at
 * @property {TaskConsumerStatusResponse} [consumer]
 */

/**
 * @typedef {Object} AutoResumeUpdateRequest
 * @property {boolean} enabled
 */

export {};
