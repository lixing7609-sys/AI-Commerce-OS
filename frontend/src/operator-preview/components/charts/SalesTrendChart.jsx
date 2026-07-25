const WIDTH = 600;
const HEIGHT = 240;
const MARGIN = { top: 16, right: 16, bottom: 28, left: 46 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;
const Y_TICKS = 4;

function formatSalesTick(value) {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
}

function SalesTrendChart({ data }) {
  const maxSales = Math.max(...data.map((point) => point.sales), 1) * 1.15;
  const maxOrders = Math.max(...data.map((point) => point.orders), 1) * 1.15;

  const barSlot = PLOT_W / data.length;
  const barWidth = barSlot * 0.46;

  const gridLines = Array.from({ length: Y_TICKS + 1 }, (_, index) => {
    const ratio = index / Y_TICKS;
    return {
      y: MARGIN.top + PLOT_H * (1 - ratio),
      value: Math.round((maxSales * ratio) / 100) * 100,
    };
  });

  const linePoints = data.map((point, index) => ({
    x: MARGIN.left + barSlot * index + barSlot / 2,
    y: MARGIN.top + PLOT_H * (1 - point.orders / maxOrders),
  }));
  const linePath = linePoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="op-chart-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="op-sales-trend-svg" role="img" aria-label="近7日销售趋势图">
        {gridLines.map((line) => (
          <g key={line.value}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={line.y} y2={line.y} className="op-chart-grid-line" />
            <text x={MARGIN.left - 8} y={line.y + 3} textAnchor="end" className="op-chart-axis-label">
              {formatSalesTick(line.value)}
            </text>
          </g>
        ))}

        {data.map((point, index) => {
          const x = MARGIN.left + barSlot * index + (barSlot - barWidth) / 2;
          const barHeight = PLOT_H * (point.sales / maxSales);
          const y = MARGIN.top + PLOT_H - barHeight;
          return (
            <g key={point.date}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="3" className="op-chart-bar">
                <title>{`${point.date} 销售额 ¥${point.sales.toLocaleString()}`}</title>
              </rect>
              <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" className="op-chart-axis-label">
                {point.date}
              </text>
            </g>
          );
        })}

        <path d={linePath} className="op-chart-line" fill="none" />
        {linePoints.map((point, index) => (
          <circle key={data[index].date} cx={point.x} cy={point.y} r="3.5" className="op-chart-line-dot">
            <title>{`${data[index].date} 订单 ${data[index].orders} 单`}</title>
          </circle>
        ))}
      </svg>

      <div className="op-chart-legend">
        <span>
          <i className="op-chart-legend-dot bar" />
          销售额
        </span>
        <span>
          <i className="op-chart-legend-dot line" />
          订单量趋势
        </span>
      </div>
    </div>
  );
}

export default SalesTrendChart;
