import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import { CHART_COLORS } from "./chartColors.js";

/**
 * Recharts 的 ResponsiveContainer 包装，统一尺寸和主题配色，避免
 * 每个模块各自重复 margin/颜色样板代码。颜色直接取 theme.css 里
 * 已经定义的品牌色/状态色的十六进制值（Recharts 需要具体颜色值，
 * 不能直接吃 CSS 变量），保持和其它组件视觉一致。
 */

export function ChartFrame({ children, height = "normal" }) {
  return (
    <div className={"fdr-chart-frame" + (height === "sm" ? " fdr-chart-frame--sm" : "")}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLineChart({ data, xKey, series, height }) {
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        {series.map((s, idx) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={s.color ?? CHART_COLORS.series[idx % CHART_COLORS.series.length]}
            strokeWidth={2}
            dot={false}
          />
        ))}
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
      </LineChart>
    </ChartFrame>
  );
}

export function ComparisonBarChart({ data, xKey, series, height }) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        {series.map((s, idx) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={s.color ?? CHART_COLORS.series[idx % CHART_COLORS.series.length]}
            radius={[4, 4, 0, 0]}
          />
        ))}
        {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
      </BarChart>
    </ChartFrame>
  );
}

export function BreakdownPieChart({ data, nameKey = "name", valueKey = "value", height }) {
  return (
    <ChartFrame height={height}>
      <PieChart>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Pie data={data} dataKey={valueKey} nameKey={nameKey} outerRadius="75%">
          {data.map((entry, idx) => (
            <Cell key={entry[nameKey]} fill={CHART_COLORS.series[idx % CHART_COLORS.series.length]} />
          ))}
        </Pie>
      </PieChart>
    </ChartFrame>
  );
}
