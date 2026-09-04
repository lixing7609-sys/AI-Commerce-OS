import { useState } from "react";
import { Tabs } from "../../../kit/Tabs.jsx";
import { PageHeader } from "../../../kit/PageHeader.jsx";
import { StatusPill, DemoBadge } from "../../../kit/StatusPill.jsx";
import { Switch } from "../../../kit/Switch.jsx";
import { Button } from "../../../kit/Button.jsx";
import { useToast } from "../../../kit/useToast.js";
import ShopCenterContent from "../../../../shared/products/operator/ShopCenterContent.jsx";
import { STORE_DETAIL_EXTRA_TABS } from "../../../modules/storeCenter/storeDetailExtraTabs.jsx";
import { StoreConnectionCenter } from "../../StoreConnectionCenter.jsx";

const TABS = [
  { key: "settings", label: "设置" },
  { key: "shops", label: "店铺管理" },
  { key: "connections", label: "平台连接" },
];

const TIMEZONE_OPTIONS = ["中国标准时间（UTC+8）", "东京时间（UTC+9）", "太平洋时间（UTC-8）"];
const LANGUAGE_OPTIONS = ["简体中文", "English"];

const DATA_PERMISSION_ROWS = [
  { id: "dp1", scope: "财务与利润数据", who: "仅运营主管可见", tone: "danger" },
  { id: "dp2", scope: "客户联系方式", who: "客服专员及以上可见", tone: "warning" },
  { id: "dp3", scope: "商品与订单数据", who: "全体成员可见", tone: "success" },
];

/**
 * 「设置」Tab——经营规则/通知设置/时区与语言/数据权限/安全设置，
 * 均为经营者日常会用到的设置，字段本身就是本地演示状态（开关/下拉），
 * 切换后立即有本地可见反馈。
 *
 * 之前这个 Tab 直接渲染 `operator-preview/pages/SettingsPage.jsx`——
 * 那是独立 /operator 应用自己的"系统设置"页面，页面副标题就写着
 * "开发与运维相关的技术设置，经营者日常操作不需要进入这里"，内容
 * 包括 AI 模型 Provider/DeepSeek 配置/Ollama 可达性/Runtime 状态/n8n/
 * 系统日志/工程文档——这些是明确写给开发者看的技术信息，不应该出现
 * 在 Operator 的「经营设置」里。本轮中文框架审查改为在这里直接构建
 * 经营者视角的设置面板，不再复用那个技术设置页（也因此不需要改动
 * 独立 /operator 应用本身的文件）。
 */
function OperatorSettingsPanel() {
  const toast = useToast();
  const [autoApproveLowRisk, setAutoApproveLowRisk] = useState(true);
  const [autoReplyCustomerService, setAutoReplyCustomerService] = useState(true);
  const [notifyNewOrder, setNotifyNewOrder] = useState(true);
  const [notifyRefund, setNotifyRefund] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyChannel, setNotifyChannel] = useState("企业微信");
  const [timezone, setTimezone] = useState(TIMEZONE_OPTIONS[0]);
  const [language, setLanguage] = useState(LANGUAGE_OPTIONS[0]);
  const [twoFactor, setTwoFactor] = useState(false);
  const [loginAlert, setLoginAlert] = useState(true);

  function handleToggle(setter, current, label) {
    setter(!current);
    toast(`${label}已${!current ? "开启" : "关闭"}`, "success");
  }

  return (
    <div>
      <PageHeader title="设置" subtitle="经营规则、通知、时区语言、数据权限与安全设置" actions={<DemoBadge />} />

      <div className="fdr-card">
        <h3 className="fdr-card__title">经营规则</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 13 }}>低风险 AI 建议自动通过</strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>风险等级 L0-L1 的经营建议无需人工确认，直接执行</p>
            </div>
            <Switch checked={autoApproveLowRisk} onChange={() => handleToggle(setAutoApproveLowRisk, autoApproveLowRisk, "低风险自动通过")} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 13 }}>客服自动应答</strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>常见售前/售后问题由 AI 自动回复，复杂问题转人工</p>
            </div>
            <Switch checked={autoReplyCustomerService} onChange={() => handleToggle(setAutoReplyCustomerService, autoReplyCustomerService, "客服自动应答")} />
          </div>
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">通知设置</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>新订单提醒</span>
            <Switch checked={notifyNewOrder} onChange={() => handleToggle(setNotifyNewOrder, notifyNewOrder, "新订单提醒")} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>退款/售后提醒</span>
            <Switch checked={notifyRefund} onChange={() => handleToggle(setNotifyRefund, notifyRefund, "退款/售后提醒")} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13 }}>低库存提醒</span>
            <Switch checked={notifyLowStock} onChange={() => handleToggle(setNotifyLowStock, notifyLowStock, "低库存提醒")} />
          </div>
          <div className="fdr-field" style={{ maxWidth: 240 }}>
            <label className="fdr-field__label">通知渠道</label>
            <select className="fdr-select" value={notifyChannel} onChange={(e) => { setNotifyChannel(e.target.value); toast(`通知渠道已切换为${e.target.value}`, "success"); }}>
              <option value="企业微信">企业微信</option>
              <option value="短信">短信</option>
              <option value="邮件">邮件</option>
            </select>
          </div>
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">时区与语言</h3>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 480 }}>
          <div className="fdr-field">
            <label className="fdr-field__label">时区</label>
            <select className="fdr-select" value={timezone} onChange={(e) => { setTimezone(e.target.value); toast("时区已更新", "success"); }}>
              {TIMEZONE_OPTIONS.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
          <div className="fdr-field">
            <label className="fdr-field__label">语言</label>
            <select className="fdr-select" value={language} onChange={(e) => { setLanguage(e.target.value); toast("语言已更新", "success"); }}>
              {LANGUAGE_OPTIONS.map((lang) => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">数据权限</h3>
        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "0 0 10px" }}>不同角色能看到的经营数据范围——详细的角色与权限分配见「组织与审批 · 团队与权限」</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DATA_PERMISSION_ROWS.map((row) => (
            <div key={row.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13 }}>{row.scope}</span>
              <StatusPill tone={row.tone}>{row.who}</StatusPill>
            </div>
          ))}
        </div>
      </div>

      <div className="fdr-card">
        <h3 className="fdr-card__title">安全设置</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 13 }}>登录双重验证</strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>开启后登录需额外验证手机验证码</p>
            </div>
            <Switch checked={twoFactor} onChange={() => handleToggle(setTwoFactor, twoFactor, "登录双重验证")} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong style={{ fontSize: 13 }}>异常登录提醒</strong>
              <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: "2px 0 0" }}>新设备/异地登录时通知我</p>
            </div>
            <Switch checked={loginAlert} onChange={() => handleToggle(setLoginAlert, loginAlert, "异常登录提醒")} />
          </div>
          <div>
            <Button size="sm" variant="secondary" onClick={() => toast("已发送修改密码链接到你的绑定邮箱（演示反馈）", "success")}>修改登录密码</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Operator Lab · Settings (Charter §3.3) — general settings, shop
 * management, and platform connections in one place. Platform
 * connections stay business-facing only ("Connect Taobao/Douyin/
 * Xiaohongshu" — StoreConnectionCenter is already this abstraction,
 * distinct from Founder's diagnostic connector overlay), per the
 * Connector Principle: Operator never sees technical connectors.
 */
export function SettingsWorkbenchPage({ activeKey }) {
  const [tab, setTab] = useState(
    activeKey === "shops" ? "shops" : activeKey === "connections" ? "connections" : "settings"
  );

  return (
    <div>
      <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />
      {tab === "settings" ? <OperatorSettingsPanel /> : null}
      {tab === "shops" ? <ShopCenterContent extraDetailTabs={STORE_DETAIL_EXTRA_TABS} /> : null}
      {tab === "connections" ? <StoreConnectionCenter /> : null}
    </div>
  );
}
