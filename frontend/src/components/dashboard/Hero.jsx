import { useEffect, useState } from "react";
import { getDashboardSummary } from "../../services/api";

function Hero() {

  const [summary, setSummary] = useState({
    products: 0,
    listings: 0,
    inventories: 0,
    orders: 0,
  });

  useEffect(() => {

    async function loadDashboard() {

      try {

        const data = await getDashboardSummary();

        console.log("Dashboard API:", data);

        setSummary(data);

      } catch (error) {

        console.error(error);

      }

    }

    loadDashboard();

  }, []);

  return (
    <section className="hero">

      <div className="hero-left">

        <div className="hero-tag">
          🤖 AI CEO 在线
        </div>

        <h2>
          上午好，立行 👋
        </h2>

        <p>
          AI CEO 已制定今天的运营计划，公司已进入自动运营状态。
        </p>

        <div
          style={{
            marginTop: "24px",
            display: "flex",
            gap: "18px",
            flexWrap: "wrap",
            fontSize: "15px",
          }}
        >
          <div>📦 产品：{summary.products}</div>
          <div>🛒 商品：{summary.listings}</div>
          <div>🏬 库存：{summary.inventories}</div>
          <div>📑 订单：{summary.orders}</div>
        </div>

        <div className="hero-buttons">

          <button className="primary-btn">
            ▶ 开始今日运营
          </button>

          <button className="secondary-btn">
            📊 查看经营报告
          </button>

        </div>

      </div>

      <div className="hero-right">

        <div className="hero-card">

          <div className="hero-number">
            ¥186,000
          </div>

          <div className="hero-label">
            今日预计销售额
          </div>

        </div>

        <div className="hero-card">

          <div className="hero-number">
            +18%
          </div>

          <div className="hero-label">
            AI预计利润增长
          </div>

        </div>

      </div>

    </section>
  );
}

export default Hero;