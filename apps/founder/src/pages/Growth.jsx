import { useState } from "react";
import { useApiState, PlaceholderCard } from "@sinofut/ui";
import { api } from "@sinofut/domain";

export function Growth() {
  const { state, refresh } = useApiState();
  const [title, setTitle] = useState("");

  if (!state) return <p>加载中…</p>;

  const createOpportunity = async (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    await api.createOpportunity({
      title,
      source: "人工录入（Growth 首页）",
      estimatedScale: "待评估",
      confidence: 0.5,
      category: "未分类",
    });
    setTitle("");
    refresh();
  };

  const generateStrategy = async (id) => {
    await api.generateStrategy(id);
    refresh();
  };

  return (
    <div>
      <div className="sf-page-header">
        <h1>增长网络</h1>
        <p>发现机会、建设流量资产。机会 → 策略是唯一驱动 Studio/Operator 后续动作的入口。</p>
      </div>

      <h2 className="sf-section-title">机会雷达（Opportunity）</h2>
      <form className="sf-form-row" onSubmit={createOpportunity}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="记录一个新机会……" />
        <button type="submit" className="sf-button-primary">新增机会</button>
      </form>

      <div className="sf-grid sf-grid-2">
        {state.opportunities.map((o) => {
          const hasStrategy = state.strategies.some((s) => s.opportunityId === o.id);
          return (
            <div key={o.id} className="sf-card">
              <h3>{o.title}</h3>
              <p>
                来源：{o.source} · 品类：{o.category} · 置信度 {(o.confidence * 100).toFixed(0)}%
              </p>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8 }}>
                <span className="sf-badge">{o.status}</span>
                <button
                  type="button"
                  className="sf-button-primary"
                  disabled={hasStrategy}
                  onClick={() => generateStrategy(o.id)}
                >
                  {hasStrategy ? "已生成策略" : "生成增长策略"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="sf-section-title">其余增长视图</h2>
      <div className="sf-grid sf-grid-2">
        <PlaceholderCard
          mission="识别可复用的渠道级机会（达人网络/私域/搜索流量渠道）"
          coreObjects={["Campaign", "Customer（私域标签）"]}
          upstream="机会雷达中标记为渠道类的机会"
          downstream="Operator 的广告投放与私域运营"
          sinoActions={["按渠道汇总历史 ROI", "推荐下一步渠道动作"]}
          status="待建模：Campaign 对象与渠道归因逻辑"
          loopRelation="机会 → 策略 → 流量交付"
          nextSteps={["定义 Campaign API", "接入达人网络数据源"]}
        />
        <PlaceholderCard
          mission="汇总由机会衍生出的内容选题机会，供 Studio 优先排期"
          coreObjects={["Content", "Strategy"]}
          upstream="已生成策略的机会"
          downstream="Studio 无限画布的选题输入"
          sinoActions={["按机会置信度排序选题优先级"]}
          status="已部分打通：策略 → Studio 创建内容（见 Studio 无限画布）"
          loopRelation="策略 → 内容生产"
          nextSteps={["在此页展示 Studio 内容生产进度回读"]}
        />
        <PlaceholderCard
          mission="识别值得上架/加大投入的商品机会"
          coreObjects={["Product", "Opportunity"]}
          upstream="机会雷达 + 供应链信号"
          downstream="Operator 商品选品决策"
          sinoActions={["匹配机会与现有供应链能力"]}
          status="待建模：Product 对象与供应链信号接入"
          loopRelation="机会 → 选品"
          nextSteps={["定义 Product 对象", "接入选品数据源"]}
        />
        <PlaceholderCard
          mission="追踪进行中的增长实验（A/B 内容/定价/渠道对比）"
          coreObjects={["Campaign", "Content"]}
          upstream="策略执行阶段"
          downstream="能力中心的验证闸门数据"
          sinoActions={["自动生成实验结论摘要"]}
          status="待建模：实验对象与统计显著性计算"
          loopRelation="策略 → 验证"
          nextSteps={["定义实验对象", "接入统计显著性计算"]}
        />
        <PlaceholderCard
          mission="展示流量资产（私域/达人/渠道网络）随时间的变化"
          coreObjects={["Customer", "Campaign"]}
          upstream="Growth 日常运营动作"
          downstream="Operator 私域运营"
          sinoActions={["生成周度流量资产变化摘要"]}
          status="待建模：私域资产网络图"
          loopRelation="Growth 内部资产建设"
          nextSteps={["设计资产网络图可视化"]}
        />
        <PlaceholderCard
          mission="列出待执行的增长任务队列"
          coreObjects={["Task"]}
          upstream="SinoFUT 任务规划"
          downstream="Founder 每日经营流程"
          sinoActions={["按优先级排序待办"]}
          status="已部分打通：任务对象已存在，见下方真实任务列表"
          loopRelation="SinoFUT → Growth 执行"
          nextSteps={["为任务增加负责人/截止时间字段"]}
        >
          <ul>
            {state.tasks.map((t) => (
              <li key={t.id}>{t.title}</li>
            ))}
            {state.tasks.length === 0 && <li>暂无任务</li>}
          </ul>
        </PlaceholderCard>
        <PlaceholderCard
          mission="汇总增长效果核心指标（曝光/点击/询盘/转化）"
          coreObjects={["Ad", "Campaign"]}
          upstream="Operator 发布与投放执行"
          downstream="数据中心 / Founder 驾驶舱"
          sinoActions={["按机会归因增长效果"]}
          status="已部分打通：发布指标已可读，见下方真实数据"
          loopRelation="Operator 执行 → 效果回流 Growth"
          nextSteps={["接入完整 Ad 对象与花费归因"]}
        >
          <ul>
            {state.publishes.map((p) => (
              <li key={p.id}>{p.channel}：曝光 {p.impressions} · 点击 {p.clicks} · 询盘 {p.leads}</li>
            ))}
            {state.publishes.length === 0 && <li>暂无发布数据</li>}
          </ul>
        </PlaceholderCard>
      </div>
    </div>
  );
}
