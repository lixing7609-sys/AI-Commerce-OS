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

export {};
