import { PlaceholderCard } from "@sinofut/ui";

export function Team() {
  return (
    <div>
      <div className="sf-page-header">
        <h1>团队协作</h1>
      </div>
      <PlaceholderCard
        mission="支持多人协同生产内容（分工、评论、协同编辑）"
        coreObjects={["Content", "Task"]}
        upstream="内容生产中心的任务分配"
        downstream="内容资产库"
        sinoActions={["按负责人汇总待办"]}
        status="待建模：团队/角色对象尚未定义"
        loopRelation="Studio 内部协作，不直接参与经营闭环"
        nextSteps={["定义团队成员与权限模型", "接入协同编辑能力"]}
      />
    </div>
  );
}
