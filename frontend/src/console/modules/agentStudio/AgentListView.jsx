import { DataTable } from "../../kit/DataTable.jsx";
import { StatusPill } from "../../kit/StatusPill.jsx";
import { useConsoleNavContext } from "../../nav/ConsoleNavContext.jsx";
import { AGENT_CATEGORIES, getAgentTemplatesByCategory } from "../../mock/agentTemplatesMock.js";
import { getAgentConfig } from "../../mock/agentStudioMock.js";

const HEALTH_TONE = { active: "success", paused: "neutral", warning: "warning", failed: "danger" };
const HEALTH_LABEL = { active: "运行中", paused: "已暂停", warning: "告警", failed: "失败" };

function AgentRow({ agent, storeId, onClick }) {
  const config = getAgentConfig(agent.name, storeId);
  const m = config.operatingMetrics;
  return (
    <tr data-clickable="true" onClick={onClick}>
      <td>{agent.name}</td>
      <td>{agent.role ?? agent.description ?? "—"}</td>
      <td><StatusPill tone={HEALTH_TONE[m.activeStatus] ?? "neutral"}>{HEALTH_LABEL[m.activeStatus] ?? m.activeStatus}</StatusPill></td>
      <td>{m.healthPercent}%</td>
      <td>{m.tasksCompleted}</td>
      <td>{m.successRate}%</td>
      <td>${m.todayCostUsd.toFixed(2)}</td>
    </tr>
  );
}

function CategorySection({ category, agents, storeId, navigate }) {
  if (agents.length === 0) return null;
  return (
    <div className="fdr-card">
      <h3 className="fdr-card__title">{category.label}</h3>
      <div className="fdr-table-wrap">
        <table className="fdr-table">
          <thead>
            <tr>
              <th>Agent</th><th>角色 / 说明</th><th>状态</th><th>健康度</th><th>今日任务</th><th>成功率</th><th>今日成本</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((agent) => (
              <AgentRow
                key={agent.name}
                agent={agent}
                storeId={storeId}
                onClick={() => navigate("agentStudio", { subView: storeId, entityId: agent.name, tab: "config" })}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Agent 列表按"经营决策 / 机会发现 / 内容运营 / 直播运营 / 售后
 * 运营"分组展示——真实后端返回的核心 Agent 归入「核心 Agent」，
 * 其余全部来自系统模板目录（agentTemplatesMock.js），共用同一套
 * 店铺级配置架构，不是可以随意新建的"任意 Agent"（阶段 Founder
 * UX Review V4）。
 */
export function AgentListView({ agents, storeId }) {
  const { navigate } = useConsoleNavContext();

  if (agents.length === 0) {
    return (
      <div className="fdr-card">
        <DataTable columns={[{ key: "name", label: "Agent" }]} rows={[]} emptyMessage="尚未注册任何 Agent" />
      </div>
    );
  }

  return (
    <div>
      {AGENT_CATEGORIES.map((category) => {
        const list = category.key === "core" ? agents : getAgentTemplatesByCategory(category.key).map((t) => ({ name: t.key, description: t.description }));
        return <CategorySection key={category.key} category={category} agents={list} storeId={storeId} navigate={navigate} />;
      })}
    </div>
  );
}
