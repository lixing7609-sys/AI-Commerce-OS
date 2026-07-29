import { PageHeader } from "../../../kit/PageHeader.jsx";
import { Button } from "../../../kit/Button.jsx";

/**
 * "内容"能力的权威实现在 Studio 实验室（内容项目/AI图文/AI视频/…），
 * Operator 实验室不维护第二份内容生产实现——这是明确的架构分工，
 * 不是"即将上线"占位：点击按钮立即真实跳转到 Studio 实验室对应
 * 页面，是一个可操作的真实动作。
 */
export function ContentRedirectNotice({ onGoToStudio }) {
  return (
    <div>
      <PageHeader title="内容" subtitle="内容生产的权威实现在 Studio 实验室，Operator 实验室不维护第二份内容生产能力" />
      <div className="fdr-card">
        <p style={{ fontSize: 13, margin: "0 0 12px" }}>
          你店铺的内容需求（图文/短视频/直播脚本等）由 Studio 实验室统一生产和管理，Operator 实验室这里只是一个入口，
          不是待完成的功能。
        </p>
        <Button variant="primary" onClick={onGoToStudio}>前往 Studio 实验室 · 内容项目</Button>
      </div>
    </div>
  );
}
