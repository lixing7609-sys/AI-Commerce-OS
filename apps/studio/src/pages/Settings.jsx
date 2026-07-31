import { PlaceholderCard } from "@sinofut/ui";

export function Settings() {
  return (
    <div>
      <div className="sf-page-header">
        <h1>设置</h1>
      </div>
      <PlaceholderCard
        mission="配置 Studio 的发布渠道、内容模板与默认生产参数"
        coreObjects={["Connector", "Capability"]}
        upstream="Founder 系统管理的全局配置"
        downstream="内容生产中心 / 无限画布"
        sinoActions={["检测渠道鉴权是否过期"]}
        status="待建模"
        loopRelation="治理层，不直接参与经营闭环"
        nextSteps={["定义 Studio 级配置项"]}
      />
    </div>
  );
}
