import { PlatformConnectorTab } from "./PlatformConnectorTab.jsx";

/**
 * 店铺详情页的 Founder 专属额外标签页配置——目前只有「平台连接器」，
 * 插入在「链接与授权」(key: auth) 之后。单独放一个文件（而不是内联
 * 在 StoreCenterModule.jsx 里）是为了满足 react-refresh 的"文件只能
 * 导出组件"规则，同时方便在不渲染整棵组件树的情况下单测标签页
 * key/label/插入位置是否正确（见 StoreCenterModule.test.js）。
 */
export const STORE_DETAIL_EXTRA_TABS = [
  {
    key: "platformConnector",
    label: "平台连接器",
    insertAfter: "auth",
    render: (shop, { switchTab }) => (
      <PlatformConnectorTab shop={shop} onGoToAuth={() => switchTab("auth")} />
    ),
  },
];
