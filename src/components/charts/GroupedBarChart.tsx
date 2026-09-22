export type BarSeriesPoint = { label: string; mean: number; std: number };
export type BarSeries = { key: string; points: BarSeriesPoint[] };

interface Props {
  title: string;
  series: BarSeries[];
  /** Series order within each month group, and the legend order. */
  order: string[];
  colors: Record<string, string>;
  /** Display label per series key, defaults to the key itself. */
  labels?: Record<string, string>;
  valueFormatter?: (value: number) => string;
}

const CHART_HEIGHT = 220;
const TICK_COUNT = 4;
const ZINC_900 = "#18181b";

// Rounds a max value up to a "nice" number (1/2/5 x a power of ten) so axis
// ticks land on readable values instead of arbitrary fractions.
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const residual = value / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

export default function GroupedBarChart({ title, series, order, colors, labels, valueFormatter }: Props) {
  // All series share one x-axis of month labels, taken from whichever
  // series has points (they're all built from the same month groups).
  const monthLabels = series.find((s) => s.points.length > 0)?.points.map((p) => p.label) ?? [];
  const rawMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.mean + p.std)));
  const axisMax = niceCeil(rawMax);
  const format = valueFormatter ?? ((v: number) => String(Math.round(v * 10) / 10));
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => (axisMax * i) / TICK_COUNT);

  const columnCount = Math.max(1, monthLabels.length);
  const barsPerGroup = Math.max(1, order.length);
  const valueY = (value: number) => CHART_HEIGHT - (Math.max(0, value) / axisMax) * CHART_HEIGHT;

  // Each month gets an equal-width group slot in the 0-100 viewBox; within a
  // group, one bar per category sits side by side (not stacked), separated
  // by a small gap, with a bit of padding between groups.
  const groupWidth = 100 / columnCount;
  const groupPadding = groupWidth * 0.15;
  const groupInnerWidth = groupWidth - groupPadding * 2;
  const barGap = groupInnerWidth * 0.08;
  const barWidth = (groupInnerWidth - barGap * (barsPerGroup - 1)) / barsPerGroup;
  const capHalfWidth = Math.min(barWidth * 0.35, 1.5);

  // Wider bar groups need more horizontal room than the fixed 420px used by
  // the sparser line charts, so many categories per month stay readable.
  const minPlotWidth = Math.max(420, columnCount * barsPerGroup * 14);

  return (
    <div className="border-b-2 border-zinc-900 p-6">
      <h3 className="mb-4 font-mono text-sm font-bold text-zinc-900">{title}</h3>

      <div className="flex gap-2">
        {/* Y-axis labels */}
        <div className="relative w-10 shrink-0" style={{ height: CHART_HEIGHT }}>
          {ticks.map((t) => (
            <span
              key={t}
              className="absolute right-1 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] text-zinc-500"
              style={{ top: CHART_HEIGHT - (t / axisMax) * CHART_HEIGHT }}
            >
              {format(t)}
            </span>
          ))}
        </div>

        {/* Plot area */}
        <div className="relative flex-1 overflow-x-auto">
          {/* Gridlines */}
          <div className="pointer-events-none absolute inset-x-0 top-0" style={{ height: CHART_HEIGHT }}>
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 ${t === 0 ? "border-t-2 border-zinc-900" : "border-t border-dashed border-zinc-300"}`}
                style={{ top: CHART_HEIGHT - (t / axisMax) * CHART_HEIGHT }}
              />
            ))}
          </div>

          <svg
            viewBox={`0 0 100 ${CHART_HEIGHT}`}
            preserveAspectRatio="none"
            className="relative border-2 border-zinc-900 bg-white"
            style={{ height: CHART_HEIGHT, width: "100%", minWidth: minPlotWidth }}
          >
            {monthLabels.map((label, groupIndex) => {
              const groupStart = groupIndex * groupWidth + groupPadding;
              return order.map((key, barIndex) => {
                const s = series.find((series) => series.key === key);
                const point = s?.points.find((p) => p.label === label);
                if (!point) return null;
                const color = colors[key] ?? "#a1a1aa";
                const x = groupStart + barIndex * (barWidth + barGap);
                const barTop = valueY(point.mean);
                const whiskerTop = valueY(point.mean + point.std);
                const whiskerBottom = valueY(point.mean - point.std);
                const cx = x + barWidth / 2;
                return (
                  <g key={`${label}-${key}`}>
                    <rect
                      x={x}
                      y={barTop}
                      width={barWidth}
                      height={CHART_HEIGHT - barTop}
                      fill={color}
                      stroke={ZINC_900}
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    >
                      <title>{`${labels?.[key] ?? key} — ${label}: ${format(point.mean)} ± ${format(point.std)}`}</title>
                    </rect>
                    <line x1={cx} y1={whiskerTop} x2={cx} y2={whiskerBottom} stroke={ZINC_900} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <line x1={cx - capHalfWidth} y1={whiskerTop} x2={cx + capHalfWidth} y2={whiskerTop} stroke={ZINC_900} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                    <line x1={cx - capHalfWidth} y1={whiskerBottom} x2={cx + capHalfWidth} y2={whiskerBottom} stroke={ZINC_900} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  </g>
                );
              });
            })}
          </svg>

          {/* Month labels */}
          <div className="mt-1 flex" style={{ minWidth: minPlotWidth }}>
            {monthLabels.map((label) => (
              <span
                key={label}
                className="min-w-0 flex-1 whitespace-nowrap text-center font-mono text-[10px] text-zinc-500"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {order.map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="h-3 w-3 border border-zinc-900"
              style={{ backgroundColor: colors[key] ?? "#a1a1aa" }}
            />
            <span className="font-mono text-xs text-zinc-700">{labels?.[key] ?? key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
