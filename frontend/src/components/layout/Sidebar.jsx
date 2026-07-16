const menus = [
  "🏠 首页",
  "📈 今日运营",
  "🤖 AI员工",
  "🏪 店铺",
  "📦 产品",
  "🛒 商品",
  "📋 订单",
  "📦 库存",
  "🚚 供应商",
  "📊 数据中心",
  "⚙ 系统设置",
];

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="logo">
        AI-Commerce-OS
      </div>

      <div className="menu">

        {menus.map((item) => (
          <div
            key={item}
            className="menu-item"
          >
            {item}
          </div>
        ))}

      </div>
    </aside>
  );
}

export default Sidebar;