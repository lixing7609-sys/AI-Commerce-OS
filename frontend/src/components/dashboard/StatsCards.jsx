import Card from "../common/Card";

function StatsCards() {

  const cards = [
    {
      title: "产品",
      value: "2",
      icon: "📦",
    },
    {
      title: "商品",
      value: "0",
      icon: "🛒",
    },
    {
      title: "库存",
      value: "0",
      icon: "🏬",
    },
    {
      title: "订单",
      value: "0",
      icon: "📄",
    },
  ];

  return (
    <div className="stats-grid">

      {cards.map((card) => (

        <Card
          key={card.title}
          title={card.title}
        >

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >

            <div
              style={{
                fontSize: "38px",
                fontWeight: 700,
              }}
            >
              {card.value}
            </div>

            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                background: "#f4f6fb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "34px",
              }}
            >
              {card.icon}
            </div>

          </div>

        </Card>

      ))}

    </div>
  );
}

export default StatsCards;