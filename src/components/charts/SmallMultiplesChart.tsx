"use client";
import { useState } from "react";

export type BandSeriesPoint = { label: string; mean: number; std: number; n: number };
export type BandSeries = { key: string; points: BandSeriesPoint[] };

interface Props {
  title: string;
  /** Every month on the x-axis, in order — shared by all panels. */
  months: string[];
  series: BandSeries[];
  /** Panel order, and the order context lines are drawn in. */
  order: string[];
  colors: Record<string, string>;
  /** Display label per series key, defaults to the key itself. */
  labels?: Record<string, string>;
  valueFormatter?: (value: number) => string;
  /** Keep y-axis ticks on whole numbers, for counts. */
  integerTicks?: boolean;
}

const PANEL_HEIGHT = 110;
const TARGET_TICKS = 3;
// Space above the highest mean + SD, as a fraction of it.
const HEADROOM = 0.05;
const BAND_OPACITY = 0.25;
const CONTEXT_COLOR = "#d4d4d8"; // zinc-300
const FALLBACK_COLOR = "#a1a1aa";

// Picks a "nice" tick step (1/2/2.5/5 x a power of ten) that splits the
// data range into roughly TARGET_TICKS intervals.
function niceStep(rawMax: number): number {
  const rough = Math.max(rawMax, 1e-9) / TARGET_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 2.5 ? 2.5 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

// Panels are too narrow for a label on every month, so only mark where the
// axis starts, each January (with its year), and where it ends.
function sparseMonthTicks(months: string[]): { index: number; text: string }[] {
  return months.flatMap((label, i) => {
    const [month, year] = label.split(" ");
    if (i === 0 || month === "Jan") return [{ index: i, text: `${month}\n${year}` }];
    if (i === months.length - 1) return [{ index: i, text: month }];
    return [];
  });
}

export default function SmallMultiplesChart({ title, months, series, order, colors, labels, valueFormatter, integerTicks }: Props) {
  // One hover index shared by every panel, so the crosshair moves in sync
  // and the same month can be compared across groups.
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // One y-scale for every panel so heights are comparable between groups.
  const rawMax = Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.mean + p.std)));
  // The axis hugs the data with a little headroom rather than rounding up
  // to a tick, so the top of the panel is usually not labelled; ticks sit
  // on nice step multiples that fit under it.
  const axisMax = rawMax * (1 + HEADROOM);
  // For counts, a fractional step (0.5, 2.5) would put ticks on
  // non-integers, so floor it to a whole number of at least 1.
  const step = integerTicks ? Math.max(1, Math.floor(niceStep(rawMax))) : niceStep(rawMax);
  const tickCount = Math.floor(axisMax / step + 1e-9);
  const format = valueFormatter ?? ((v: number) => String(Math.round(v * 10) / 10));
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => step * i);
  const monthTicks = sparseMonthTicks(months);

  const columnCount = Math.max(1, months.length);
  // Each month's point sits at the centre of its equal-width slot in the
  // 0-100 viewBox.
  const monthX = (index: number) => ((index + 0.5) * 100) / columnCount;
  const valueY = (value: number) => PANEL_HEIGHT - (Math.max(0, value) / axisMax) * PANEL_HEIGHT;

  const pointsByKey = new Map(series.map((s) => [s.key, new Map(s.points.map((p) => [p.label, p]))]));

  // A group can be absent in some months (nobody at that level staffed), so
  // split each series into runs of consecutive months and draw each run
  // separately rather than bridging the gap with a misleading line.
  const runsFor = (key: string) => {
    const byLabel = pointsByKey.get(key);
    const runs: { x: number; point: BandSeriesPoint }[][] = [];
    let current: { x: number; point: BandSeriesPoint }[] = [];
    months.forEach((label, i) => {
      const point = byLabel?.get(label);
      if (point) {
        current.push({ x: monthX(i), point });
      } else if (current.length) {
        runs.push(current);
        current = [];
      }
    });
    if (current.length) runs.push(current);
    return runs;
  };

  // Maps the cursor's horizontal position onto the nearest month slot.
  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = (e.clientX - rect.left) / rect.width;
    setHoverIndex(Math.min(columnCount - 1, Math.max(0, Math.floor(fraction * columnCount))));
  };

  const hoverLabel = hoverIndex !== null ? months[hoverIndex] : null;

  return (
    <div className="border-b-2 border-zinc-900 p-6">
      <h3 className="mb-1 font-mono text-sm font-bold text-zinc-900">{title}</h3>
      <p className="mb-4 font-mono text-[10px] text-zinc-500">
        Line = mean, band = ±1 SD, n = teammates staffed that month. Grey lines are the other groups.
      </p>

      {/* Flex-wrap rather than grid so a short last row (e.g. 3 of 7 levels)
          is centred. Widths reproduce 1/2/4 columns, each panel giving up its
          share of the 24px (gap-x-6) gutters. */}
      <div className="flex flex-wrap justify-center gap-x-6 gap-y-5">
        {order.map((key) => {
          const color = colors[key] ?? FALLBACK_COLOR;
          const runs = runsFor(key);
          const allPoints = runs.flat().map((r) => r.point);
          const hoverPoint = hoverLabel ? pointsByKey.get(key)?.get(hoverLabel) : undefined;
          const nValues = allPoints.map((p) => p.n);
          const nMin = Math.min(...nValues);
          const nMax = Math.max(...nValues);

          return (
            <div key={key} className="w-full min-w-0 sm:w-[calc(50%-12px)] xl:w-[calc(25%-18px)]">
              {/* Panel header: group name with its headcount range across the
                  whole period, and the hovered month's value on the right.
                  Indented by the y-axis column (w-8 + gap-1) so it sits over
                  the plot box. */}
              <div className="mb-2 ml-9 flex items-baseline justify-between gap-2 font-mono text-[11px]">
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="h-0.5 w-3" style={{ backgroundColor: color }} />
                  <span className="font-bold text-zinc-900">{labels?.[key] ?? key}</span>
                  <span className="text-[10px] text-zinc-500">
                    {allPoints.length ? `(n=${nMin === nMax ? nMin : `${nMin}–${nMax}`})` : "(no data)"}
                  </span>
                </span>
                {hoverLabel && (
                  <span className="truncate text-zinc-500">
                    {hoverPoint
                      ? `${hoverLabel}: ${format(hoverPoint.mean)} ± ${format(hoverPoint.std)} (n=${hoverPoint.n})`
                      : `${hoverLabel}: no one staffed`}
                  </span>
                )}
              </div>

              <div className="flex gap-1">
                {/* Y-axis labels */}
                <div className="relative w-8 shrink-0" style={{ height: PANEL_HEIGHT }}>
                  {ticks.map((t) => (
                    <span
                      key={t}
                      className="absolute right-1 -translate-y-1/2 whitespace-nowrap font-mono text-[9px] text-zinc-500"
                      style={{ top: valueY(t) }}
                    >
                      {format(t)}
                    </span>
                  ))}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="relative border-2 border-zinc-900 bg-white"
                    style={{ height: PANEL_HEIGHT }}
                    onMouseMove={handleMove}
                    onMouseLeave={() => setHoverIndex(null)}
                  >
                    {/* Gridlines (the 0 baseline is the panel border) */}
                    {ticks.slice(1).map((t) => (
                      <div
                        key={t}
                        className="pointer-events-none absolute inset-x-0 border-t border-dashed border-zinc-200"
                        style={{ top: valueY(t) }}
                      />
                    ))}

                    <svg
                      viewBox={`0 0 100 ${PANEL_HEIGHT}`}
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full overflow-visible"
                    >
                      {/* Other groups as thin grey context lines, underneath */}
                      {order
                        .filter((other) => other !== key)
                        .map((other) =>
                          runsFor(other).map((run, i) => (
                            <polyline
                              key={`${other}-${i}`}
                              points={run.map(({ x, point }) => `${x},${valueY(point.mean)}`).join(" ")}
                              fill="none"
                              stroke={CONTEXT_COLOR}
                              strokeWidth={1}
                              vectorEffect="non-scaling-stroke"
                            />
                          )),
                        )}

                      {/* This group's band, then its line on top */}
                      {runs.map((run, i) => {
                        const upper = run.map(({ x, point }) => `${x},${valueY(point.mean + point.std)}`);
                        const lower = run.map(({ x, point }) => `${x},${valueY(point.mean - point.std)}`).reverse();
                        return (
                          <polygon
                            key={`band-${i}`}
                            points={[...upper, ...lower].join(" ")}
                            fill={color}
                            fillOpacity={BAND_OPACITY}
                          />
                        );
                      })}
                      {runs.map((run, i) => (
                        <polyline
                          key={`line-${i}`}
                          points={run.map(({ x, point }) => `${x},${valueY(point.mean)}`).join(" ")}
                          fill="none"
                          stroke={color}
                          strokeWidth={2}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}

                      {hoverIndex !== null && (
                        <line
                          x1={monthX(hoverIndex)}
                          x2={monthX(hoverIndex)}
                          y1={0}
                          y2={PANEL_HEIGHT}
                          stroke="#71717a"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
                    </svg>

                    {/* Hover dot, in HTML so it stays round despite the stretched viewBox */}
                    {hoverIndex !== null && hoverPoint && (
                      <span
                        className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
                        style={{ left: `${monthX(hoverIndex)}%`, top: valueY(hoverPoint.mean), backgroundColor: color }}
                      />
                    )}
                  </div>

                  {/* Sparse month labels, positioned under their month slot */}
                  <div className="relative h-6">
                    {monthTicks.map(({ index, text }) => (
                      <span
                        key={index}
                        className="absolute top-0.5 -translate-x-1/2 whitespace-pre text-center font-mono text-[9px] leading-tight text-zinc-500"
                        style={{ left: `${monthX(index)}%` }}
                      >
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
