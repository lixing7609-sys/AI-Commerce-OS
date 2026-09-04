import { useState } from "react";
import { Card, DemoBadge, Field, Pill, Table, Tabs } from "./uiHelpers.jsx";
import { useInlineFeedback } from "./useInlineFeedback.js";
import { BrandGuidelinesPage } from "./PlatformPages.jsx";
import { BrandDealsPage, IpLicensingPage } from "./MonetizationPages.jsx";

const TABS = [
  { key: "guidelines", label: "品牌规范" },
  { key: "visual", label: "视觉资产" },
  { key: "story", label: "品牌故事与IP角色" },
  { key: "deals", label: "品牌合作" },
  { key: "ip", label: "版权 / IP授权" },
  { key: "consistency", label: "一致性检查" },
];

const LOGO_ASSETS = [
  { id: "logo-1", name: "主 Logo（横版）", format: "SVG / PNG", usage: "官网、公众号头图、品牌合作物料" },
  { id: "logo-2", name: "主 Logo（竖版）", format: "SVG / PNG", usage: "小红书头像、抖音头像" },
  { id: "logo-3", name: "Logo 图标（单色）", format: "SVG", usage: "水印、favicon、深色底场景" },
];

const FONT_ASSETS = [
  { id: "font-1", name: "思源黑体 Bold", usage: "标题、封面主标题" },
  { id: "font-2", name: "思源黑体 Regular", usage: "正文、字幕" },
  { id: "font-3", name: "手写体·温暖系", usage: "情绪化文案、品牌故事类内容" },
];

const COLOR_ASSETS = [
  { id: "color-1", name: "品牌主色", value: "#0D9488", usage: "主按钮、关键数据高亮" },
  { id: "color-2", name: "品牌辅色", value: "#0F172A", usage: "标题文字、深色背景" },
  { id: "color-3", name: "点缀色", value: "#F59E0B", usage: "预警、限时优惠标签" },
];

const PRODUCT_VISUAL_ASSETS = [
  { id: "pv-1", name: "LightOS 氛围灯 · 场景实拍图集", count: 24, usage: "商品种草图文、直播背景" },
  { id: "pv-2", name: "静音加湿器 · 白底图 + 参数图", count: 12, usage: "商品详情、平台版本适配" },
];

const TEMPLATE_ASSETS = [
  { id: "tpl-1", name: "小红书图文封面模板", count: 6, usage: "AI图文一键套用" },
  { id: "tpl-2", name: "短剧片头/片尾模板", count: 3, usage: "AI短剧统一片头片尾" },
  { id: "tpl-3", name: "直播间背景模板", count: 4, usage: "AI直播控制台背景" },
];

const BRAND_STORY = {
  origin: "「AI Commerce OS」诞生于一个朴素的问题：一个人能不能经营一家真正意义上的公司？我们相信答案是肯定的——只要有足够可靠的 AI 团队。",
  mission: "让每一位创作者/经营者都能拥有一支 7×24 小时在线的 AI 内容团队。",
  voice: "专业、克制，带一点鼓舞人心的表达，不使用无依据的极限用语。",
};

const IP_CHARACTERS = [
  { id: "c-linwan", name: "林晚", ip: "《重生后我接管了老板的公司》", role: "女主角 · 公司原创始人", personality: "冷静克制，外柔内刚" },
  { id: "c-zhouqi", name: "周启", ip: "《重生后我接管了老板的公司》", role: "反派 · 现任老板", personality: "强势多疑" },
  { id: "c-ai-founder", name: "AI 一人公司观察员", ip: "AI 一人公司商业观察 IP", role: "知识 IP 出镜形象", personality: "理性、爱举案例" },
];

const CONSISTENCY_CHECKS = [
  { id: "cc-1", item: "Logo 使用是否留白规范", status: "pass" },
  { id: "cc-2", item: "主色/辅色是否在允许色值范围内", status: "pass" },
  { id: "cc-3", item: "字体是否使用规范字体而非系统默认字体", status: "pass" },
  { id: "cc-4", item: "IP 角色形象是否跨集/跨内容一致", status: "warning" },
  { id: "cc-5", item: "品牌语气是否符合调性（禁用极限词）", status: "pass" },
  { id: "cc-6", item: "商品视觉是否使用最新版素材", status: "warning" },
];

const CHECK_TONE = { pass: "success", warning: "warning", fail: "danger" };
const CHECK_LABEL = { pass: "通过", warning: "待关注", fail: "未通过" };

function VisualAssetsTab({ showFeedback }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card title="Logo">
        <Table
          columns={[
            { key: "name", label: "名称" }, { key: "format", label: "格式" }, { key: "usage", label: "适用场景" },
            { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已复制「${r.name}」下载链接（演示）`)}>下载</button> },
          ]}
          rows={LOGO_ASSETS}
        />
      </Card>
      <Card title="字体">
        <Table columns={[{ key: "name", label: "字体" }, { key: "usage", label: "适用场景" }]} rows={FONT_ASSETS} />
      </Card>
      <Card title="色彩">
        <Table
          columns={[
            { key: "name", label: "色彩" },
            { key: "value", label: "色值", render: (r) => <span className="st-btn-row"><span style={{ width: 14, height: 14, borderRadius: 4, background: r.value, display: "inline-block", border: "1px solid var(--border)" }} />{r.value}</span> },
            { key: "usage", label: "适用场景" },
          ]}
          rows={COLOR_ASSETS}
        />
      </Card>
      <Card title="商品视觉">
        <Table columns={[{ key: "name", label: "素材集" }, { key: "count", label: "数量" }, { key: "usage", label: "适用场景" }]} rows={PRODUCT_VISUAL_ASSETS} />
      </Card>
      <Card title="模板">
        <Table
          columns={[
            { key: "name", label: "模板" }, { key: "count", label: "数量" }, { key: "usage", label: "适用场景" },
            { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已应用模板「${r.name}」`)}>应用模板</button> },
          ]}
          rows={TEMPLATE_ASSETS}
        />
      </Card>
    </div>
  );
}

function BrandStoryTab() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card title="品牌故事">
        <Field label="品牌起源"><textarea value={BRAND_STORY.origin} readOnly /></Field>
        <Field label="品牌使命"><textarea value={BRAND_STORY.mission} readOnly /></Field>
        <Field label="品牌语气"><textarea value={BRAND_STORY.voice} readOnly /></Field>
      </Card>
      <Card title="IP 角色">
        <Table
          columns={[
            { key: "name", label: "角色" }, { key: "ip", label: "所属 IP" }, { key: "role", label: "定位" }, { key: "personality", label: "性格" },
          ]}
          rows={IP_CHARACTERS}
        />
      </Card>
    </div>
  );
}

function ConsistencyCheckTab({ showFeedback }) {
  return (
    <Card title="品牌一致性检查">
      <p style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 0 }}>覆盖 Logo / 色彩 / 字体 / IP 角色 / 语气 / 商品视觉六个维度的自动检查（演示规则，未接入真实素材扫描）。</p>
      <Table
        columns={[
          { key: "item", label: "检查项" },
          { key: "status", label: "结果", render: (r) => <Pill tone={CHECK_TONE[r.status]}>{CHECK_LABEL[r.status]}</Pill> },
          { key: "actions", label: "操作", render: (r) => <button type="button" className="st-btn st-btn-sm" onClick={() => showFeedback(`已重新检查「${r.item}」`)}>重新检查</button> },
        ]}
        rows={CONSISTENCY_CHECKS}
      />
    </Card>
  );
}

/** Studio Lab · Brand Assets (Charter §3.4). */
export function BrandAssetsPage() {
  const [tab, setTab] = useState("guidelines");
  const [feedback, showFeedback] = useInlineFeedback();

  return (
    <div>
      <div className="st-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>品牌资产 —— 品牌规范、视觉资产、品牌故事与 IP 角色、品牌合作与版权授权的统一管理入口</div>
        {feedback ? <span className="st-inline-feedback">{feedback}</span> : <DemoBadge />}
      </div>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      {tab === "guidelines" ? <BrandGuidelinesPage /> : null}
      {tab === "visual" ? <VisualAssetsTab showFeedback={showFeedback} /> : null}
      {tab === "story" ? <BrandStoryTab /> : null}
      {tab === "deals" ? <BrandDealsPage /> : null}
      {tab === "ip" ? <IpLicensingPage /> : null}
      {tab === "consistency" ? <ConsistencyCheckTab showFeedback={showFeedback} /> : null}
    </div>
  );
}
