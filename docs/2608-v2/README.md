# AI Commerce OS 2608·V2（代号 SinoFUT）—— 奠基文档集

本目录是 2608·V2 开发宪章第十八条要求的前置文档集（原定四份，Founder 确认方向后追加两份商业/流程文档），是 V2 唯一的架构依据。

**与 V1 的关系**：本目录不引用、不兼容、不迁就 `docs/00-project`、`docs/01-foundation`、`docs/01-reference-architecture`、
`docs/02-specification`、`docs/03-domain` 等既有文档所描述的架构、导航或数据结构。V1 保留作为历史参考，
不作为 V2 的任何设计输入。凡本文档集与 V1 冲突之处，以本文档集为准，V1 对应部分视为废弃。

**例外**：`docs/00-project/vision.md`（项目宪法）中"一人多店、AI 是执行者、人是决策者"的立业初心予以保留延续，
因为宪章本身（"永久开发原则"）与 vision.md 在这一点上一致，不构成 V1 页面/架构的延续。

## 文档清单

| # | 文档 | 内容 |
|---|------|------|
| 1 | [01-architecture.md](01-architecture.md) | 总体架构：业务边界、模块关系、数据流 |
| 2 | [02-domain-model.md](02-domain-model.md) | 领域模型：核心对象及其关系 |
| 3 | [03-information-architecture.md](03-information-architecture.md) | 信息架构：一级/二级导航与产品结构 |
| 4 | [04-design-system.md](04-design-system.md) | 设计系统：设计语言、组件规范、交互原则 |
| 5 | [05-business-ecosystem.md](05-business-ecosystem.md) | 商业生态设计：七大主体的商业关系、利润来源、能力流转、验证机制、经营闭环 |
| 6 | [06-founder-daily-operations.md](06-founder-daily-operations.md) | Founder 每日经营流程：从开机到收工的真实经营时间线，作为未来页面/Agent/Workflow 的验收基准 |
| 7 | [07-foundation-review.md](07-foundation-review.md) | 跨文档一致性审查：发现的冲突、已修订内容、遗留非阻塞问题、放行结论 |
| 8 | 08-backend-reuse-audit.md（代码阶段产出） | 现有 Python 后端能力复用审查：可复用/需适配/须重写/暂不接入/已废弃 |

## 状态

01～06 号文档已根据 V2-001 任务要求完成跨文档一致性审查，**Operator Cloud 定位、多租户/权限边界等冲突已直接修订进 01/02/03/05 号文档**，详见 07 号文档。审查结论：**允许进入代码阶段**。

文档基线（01～07）将作为独立 git 提交（`docs: establish SinoFUT AI Commerce OS 2608·V2 foundation`），随后进入 V2 工程与首批页面开发。
