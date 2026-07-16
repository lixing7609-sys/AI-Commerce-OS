function Header() {
  const today = new Date();

  const dateText = today.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });

  return (
    <header className="header">

      <div>

        <h1>👋 上午好，立行</h1>

        <p>{dateText}</p>

      </div>

      <div className="header-right">

        <div className="status-card">

          <div className="status-title">
            AI CEO
          </div>

          <div className="status-value">
            🟢 在线
          </div>

        </div>

        <div className="status-card">

          <div className="status-title">
            AI员工
          </div>

          <div className="status-value">
            5 / 5 运行中
          </div>

        </div>

      </div>

    </header>
  );
}

export default Header;