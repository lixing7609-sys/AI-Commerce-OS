import { useState } from "react";
import { getStudioState } from "../mock/studioMock.js";
import { formatMoney } from "./formatters.js";
import { Card, DemoBadge, Field, Pill, Table } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { LiveCommercePage } from "./MonetizationPages.jsx";

const LIVE_STATUS_TONE = { 已排期: "neutral", 进行中: "info", 待审核: "warning", 已结束: "success" };

const TABS = [
  { key: "project", label: "直播项目" },
  { key: "topic", label: "直播主题" },
  { key: "products", label: "商品清单" },
  { key: "script", label: "直播脚本" },
  { key: "rehearsal", label: "排练" },
  { key: "console", label: "直播控制台框架" },
  { key: "host", label: "AI 主播" },
  { key: "prompter", label: "实时提示" },
  { key: "commerce", label: "带货数据" },
  { key: "retro", label: "复盘" },
  { key: "clips", label: "发布切片" },
];

const PRODUCT_LISTS = {
  "live-1": [
    { id: 1, name: "重生豪门联名帆布袋", price: 89, stock: 500, highlight: "限量周边，剧中同款配色" },
    { id: 2, name: "重生豪门角色徽章套装", price: 59, stock: 800, highlight: "4 款角色徽章随机发放" },
  ],
  "live-2": [
    { id: 1, name: "LightOS 无线氛围灯", price: 129, stock: 1200, highlight: "直播间专属立减 30 元" },
    { id: 2, name: "静音加湿器 Mini", price: 199, stock: 600, highlight: "满 2 件享 9 折" },
    { id: 3, name: "香薰机三件套", price: 259, stock: 300, highlight: "赠送香薰精油小样" },
  ],
  "live-3": [{ id: 1, name: "海外仓招商合作方案册", price: 0, stock: 999, highlight: "扫码领取电子版" }],
  "live-4": [
    { id: 1, name: "重生豪门剧情彩蛋周边盲盒", price: 79, stock: 400, highlight: "含隐藏款概率 5%" },
  ],
};

const PROMPTER_NOTES = {
  "live-1": ["欢迎语：感谢大家来到重生豪门角色见面会", "引导关注官方账号抽联名周边", "提醒：涉及角色台词需标注为二创改编"],
  "live-2": ["开场话术：家居好物清单已上架小黄车", "库存播报：氛围灯剩余 1200 件", "话术禁词提醒：不得使用「最」「第一」"],
  "live-3": ["合规提醒：招商类话术需按脚本逐字播报，不得口头承诺收益", "预计答疑环节 20 分钟"],
  "live-4": ["剧情彩蛋预警：涉及未播出剧情需二次确认授权", "带货节奏：彩蛋后立即引导下单"],
};

const RETRO_NOTES = {
  "live-1": "尚未开播，暂无复盘数据。",
  "live-2": "峰值在线 6,800 人，转化率 4.2%，建议下次提前 30 分钟预热。",
  "live-3": "审核未通过前不得开播，复盘将在审核通过后生成。",
  "live-4": "GMV 5.4 万，彩蛋环节带动下单高峰，建议固定为月度栏目。",
};

/**
 * Studio Lab · AI 直播（Charter §3.4）——直播项目 / 直播主题 / 商品
 * 清单 / 直播脚本 / 排练 / 直播控制台框架 / AI 主播 / 实时提示 /
 * 带货数据 / 复盘 / 发布切片。`aiLiveProjects` 提供每场直播的脚本、
 * 数字人、平台、场次、观看与流量数据；商品清单、实时提示、复盘为
 * 小型本地演示数据补齐，不接入真实直播推流或电商中控。
 */
export function AiLiveWorkbench() {
  const [tab, setTab] = useState("project");
  const { aiLiveProjects } = getStudioState();
  const [feedback, showFeedback] = useInlineFeedback();
  const [scriptDrafts, setScriptDrafts] = useState({});

  return (
    <Card title="AI 直播" action={feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}>
      <div className="st-tabs" style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`st-tab${tab === t.key ? " active" : ""}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === "project" ? (
        <Table
          columns={[
            { key: "name", label: "直播项目" }, { key: "platform", label: "直播平台" }, { key: "sessionCount", label: "场次" },
            { key: "status", label: "当前状态", render: (r) => <Pill tone={LIVE_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
          ]}
          rows={aiLiveProjects}
        />
      ) : null}

      {tab === "topic" ? (
        <Table columns={[{ key: "name", label: "直播项目" }, { key: "topicOrProduct", label: "直播主题/商品" }, { key: "platform", label: "直播平台" }]} rows={aiLiveProjects} />
      ) : null}

      {tab === "products" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {aiLiveProjects.map((p) => (
            <Card key={p.liveId} title={p.name}>
              <Table
                columns={[
                  { key: "name", label: "商品" }, { key: "price", label: "价格", render: (r) => (r.price ? formatMoney(r.price) : "免费") },
                  { key: "stock", label: "库存" }, { key: "highlight", label: "讲解要点" },
                ]}
                rows={PRODUCT_LISTS[p.liveId] ?? []}
                empty="暂无商品清单"
              />
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "script" ? (
        <Table columns={[{ key: "name", label: "直播项目" }, { key: "script", label: "直播脚本" }, { key: "digitalHuman", label: "数字人" }]} rows={aiLiveProjects} />
      ) : null}

      {tab === "rehearsal" ? (
        <Table
          columns={[
            { key: "name", label: "直播项目" }, { key: "sessionCount", label: "已排练/已开播场次" }, { key: "complianceRisk", label: "违规风险自查" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已为「${r.name}」发起一次排练（演示）`)}>发起排练</button>
              ),
            },
          ]}
          rows={aiLiveProjects}
        />
      ) : null}

      {tab === "console" ? (
        <div>
          <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>直播控制台为架构框架，尚未接入真实推流/中控系统，以下字段结构可直接替换为真实直播 SDK 数据。</p>
          <Table
            columns={[
              { key: "name", label: "直播项目" },
              { key: "status", label: "当前状态", render: (r) => <Pill tone={LIVE_STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
              { key: "viewers", label: "实时观看人数", render: (r) => r.viewers.toLocaleString() },
              { key: "traffic", label: "流量", render: (r) => r.traffic.toLocaleString() },
              {
                key: "actions", label: "操作", render: (r) => (
                  <span className="st-btn-row">
                    <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已切换「${r.name}」推流画面（演示）`)}>切换画面</button>
                    <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已上架讲解商品（演示）`)}>上架商品</button>
                  </span>
                ),
              },
            ]}
            rows={aiLiveProjects}
          />
        </div>
      ) : null}

      {tab === "host" ? (
        <Table
          columns={[
            { key: "name", label: "直播项目" }, { key: "digitalHuman", label: "AI 主播 / 数字人形象" },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已切换「${r.name}」的 AI 主播形象（演示）`)}>切换形象</button>
              ),
            },
          ]}
          rows={aiLiveProjects}
        />
      ) : null}

      {tab === "prompter" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {aiLiveProjects.map((p) => (
            <Card key={p.liveId} title={p.name}>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12 }}>
                {(PROMPTER_NOTES[p.liveId] ?? []).map((n, idx) => <li key={idx}>{n}</li>)}
              </ul>
              <Field label="添加实时提示">
                <input
                  value={scriptDrafts[p.liveId] ?? ""}
                  onChange={(e) => setScriptDrafts((d) => ({ ...d, [p.liveId]: e.target.value }))}
                  placeholder="例如：提醒主播强调今日限时优惠"
                />
              </Field>
              <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback("已推送实时提示到主播提词器（演示）")}>推送提示</button>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "commerce" ? <LiveCommercePage /> : null}

      {tab === "retro" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {aiLiveProjects.map((p) => (
            <Card key={p.liveId} title={p.name}>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{RETRO_NOTES[p.liveId]}</p>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "clips" ? (
        <Table
          columns={[
            { key: "name", label: "直播项目" }, { key: "platform", label: "发布平台" }, { key: "revenue", label: "收入", render: (r) => formatMoney(r.revenue) },
            {
              key: "actions", label: "操作", render: (r) => (
                <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已从「${r.name}」生成发布切片（演示）`)}>生成切片</button>
              ),
            },
          ]}
          rows={aiLiveProjects}
        />
      ) : null}
    </Card>
  );
}
