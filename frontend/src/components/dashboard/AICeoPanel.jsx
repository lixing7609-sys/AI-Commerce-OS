import Card from "../common/Card";

function AICeoPanel() {

  return (

    <Card title="🤖 AI CEO">

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "18px",
        }}
      >

        <div>

          <div
            style={{
              fontSize: "18px",
              fontWeight: 700,
              marginBottom: "10px",
            }}
          >
            今日经营分析
          </div>

          <div
            style={{
              color: "#666",
              lineHeight: "28px",
            }}
          >
            ✅ 产品数量：2
            <br />
            ⚠ 商品待发布：2
            <br />
            ⚠ 今日暂无订单
            <br />
            ✅ 库存状态正常
          </div>

        </div>

        <div
          style={{
            borderTop: "1px solid #eee",
            paddingTop: "18px",
          }}
        >

          <div
            style={{
              fontWeight: 700,
              marginBottom: "10px",
            }}
          >
            AI 建议
          </div>

          <div
            style={{
              color: "#666",
              lineHeight: "28px",
            }}
          >
            • 发布全部待发布商品
            <br />
            • 同步库存至抖音店铺
            <br />
            • 自动生成今日营销内容
          </div>

        </div>

      </div>

    </Card>

  );

}

export default AICeoPanel;