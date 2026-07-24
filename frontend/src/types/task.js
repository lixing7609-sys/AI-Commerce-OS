/**
 * Task 提交相关的响应结构定义（JSDoc 类型）。
 *
 * 项目当前未启用 TypeScript（无 tsconfig，全部源码为 .js/.jsx），
 * 这里用 JSDoc typedef 记录与后端 POST /api/v1/tasks/submit 完全
 * 一致的字段形状，供编辑器提示与代码阅读参考，不引入新的构建
 * 工具链。
 *
 * @typedef {"high" | "normal" | "low"} TaskPriority
 */

/**
 * POST /api/v1/tasks/submit 的请求体。
 *
 * context 本轮不向用户开放编辑，前端固定发送空对象。
 *
 * @typedef {Object} TaskSubmitRequest
 * @property {string} assigned_agent
 * @property {string} task
 * @property {Object.<string, any>} context
 * @property {TaskPriority} priority
 * @property {number | null} [shop_id] 阶段 8E：目标店铺 id，null 表示未绑定店铺
 */

/**
 * POST /api/v1/tasks/submit 的成功响应（HTTP 202）。
 *
 * status 恒为 "pending"——本接口只入队，不代表任务已经执行完成。
 *
 * @typedef {Object} TaskSubmitResponse
 * @property {string} id
 * @property {string} status
 * @property {string} assigned_agent
 * @property {string} task_type
 * @property {TaskPriority} priority
 * @property {string} created_at
 * @property {string} message
 */

/**
 * GET /api/v1/tasks/{task_id}（以及 GET /api/v1/tasks 列表项）返回的
 * 完整任务结构。展示到 UI 前必须先经过
 * taskDetailHelpers.sanitizeTaskDetail() 处理，不得把该对象整体
 * （尤其是 payload/context）直接传给界面。
 *
 * @typedef {Object} TaskDetail
 * @property {string} id
 * @property {string} task_type
 * @property {Object.<string, any>} payload
 * @property {string | null} assigned_agent
 * @property {string} priority
 * @property {string} status
 * @property {string | null} created_at
 * @property {string | null} started_at
 * @property {string | null} completed_at
 * @property {Object.<string, any> | null} result
 * @property {string | null} error
 */

export {};
