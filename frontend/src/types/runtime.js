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
 */

/**
 * @typedef {Object} AutoResumeUpdateRequest
 * @property {boolean} enabled
 */

export {};
