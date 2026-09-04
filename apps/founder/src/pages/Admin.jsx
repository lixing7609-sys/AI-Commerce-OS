import { PlaceholderCard } from "@sinofut/ui";

export function Admin() {
  return (
    <div>
      <div className="sf-page-header">
        <h1>系统管理</h1>
        <p>本系统中唯一允许"传统后台风格"的区域（见 04-design-system.md §6）。</p>
      </div>

      <div className="sf-card" style={{ marginBottom: "var(--space-3)" }}>
        <h3>当前租户（Tenant）</h3>
        <p>Founder 主租户 · 单租户模式（多租户扩展点已在 02-domain-model.md §4.1 预留，尚未启用）</p>
      </div>

      <div className="sf-grid sf-grid-2">
        <PlaceholderCard
          mission="管理账户与角色权限边界"
          coreObjects={["Tenant", "Role / Permission"]}
          upstream="Founder 手动配置"
          downstream="SinoFUT 调度前的权限解析"
          sinoActions={["检测越权访问尝试"]}
          status="待建模：单租户默认值已实现，多角色 UI 待建"
          loopRelation="治理层，不直接参与经营闭环"
          nextSteps={["定义 Role 编辑 UI", "接入真实权限校验"]}
        />
        <PlaceholderCard
          mission="管理 Connector 鉴权凭证"
          coreObjects={["Connector"]}
          upstream="平台方 API Key/OAuth"
          downstream="Agent/Workflow 调用"
          sinoActions={["检测即将过期的鉴权凭证"]}
          status="后端已有可复用实现：app/integrations/platforms/*"
          loopRelation="能力层基础设施"
          nextSteps={["接入真实 Connector 状态列表"]}
        />
        <PlaceholderCard
          mission="配置 Approval 触发规则（金额阈值/风险等级）"
          coreObjects={["Approval"]}
          upstream="Founder 手动配置"
          downstream="SinoFUT 审批路由 Workflow"
          sinoActions={["模拟新规则对历史数据的影响"]}
          status="待建模：规则引擎"
          loopRelation="Human-in-the-loop 原则的配置层"
          nextSteps={["定义规则 DSL"]}
        />
        <PlaceholderCard
          mission="管理品牌/店铺主数据"
          coreObjects={["Brand", "Store"]}
          upstream="Operator 经营中心录入"
          downstream="全系统品牌/店铺归属校验"
          sinoActions={["检测重复/冲突的主数据"]}
          status="待建模"
          loopRelation="经营对象主数据治理"
          nextSteps={["定义 Brand/Store 主数据模型"]}
        />
      </div>

      <h2 className="sf-section-title">系统日志</h2>
      <p style={{ color: "var(--text-tertiary)" }}>
        后端已有可复用的操作日志能力（app/models/operation_log_db.py + app/services/operation_log_service.py，
        见 08-backend-reuse-audit.md），本阶段前端暂以占位说明代替真实日志流。
      </p>
    </div>
  );
}
