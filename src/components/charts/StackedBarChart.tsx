import { monthTickText } from "./monthTicks";

export type StackedBarSegment = {
  key: string;
  value: number;
};

export type StackedBarDatum = {
  label: string;
  segments: StackedBarSegment[];
};

interface Props {
  title: string;
  data: StackedBarDatum[];
  /** Stacking order, bottom to top, and the legend order. */
  order: string[];
  colors: Record<string, string>;
  /** Display label per segment key, defaults to the key itself. */
  labels?: Record<string, string>;
  valueFormatter?: (value: number) => string;
}

const CHART_HEIGHT = 220;
const TICK_COUNT = 4;

// Rounds a max value up to a "nice" number (1/2/5 x a power of ten) so axis
// ticks land on readable values instead of arbitrary fractions.
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const residual = value / magnitude;
  const niceResidual = residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10;
  return niceResidual * magnitude;
}

export default function StackedBarChart({ title, data, order, colors, labels, valueFormatter }: Props) {
  const rawMax = Math.max(1, ...data.map((d) => d.segments.reduce((sum, s) => sum + s.value, 0)));
  const axisMax = niceCeil(rawMax);
  const format = valueFormatter ?? ((v: number) => String(Math.round(v * 10) / 10));
  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) => (axisMax * i) / TICK_COUNT);
  const tickText = monthTickText(data.map((d) => d.label));

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

          <div className="flex items-end gap-3" style={{ height: CHART_HEIGHT }}>
            {data.map((d) => {
              const total = d.segments.reduce((sum, s) => sum + s.value, 0);
              const barHeight = (total / axisMax) * CHART_HEIGHT;
              return (
                <div
                  key={d.label}
                  className="flex w-full min-w-[36px] flex-1 flex-col-reverse overflow-hidden border-2 border-zinc-900 bg-white"
                  style={{ height: barHeight }}
                  title={`${d.label}: ${format(total)}`}
                >
                  {order
                    .map((key) => d.segments.find((s) => s.key === key))
                    .filter((s): s is StackedBarSegment => !!s && s.value > 0)
                    .map((s) => (
                      <div
                        key={s.key}
                        style={{
                          height: total > 0 ? `${(s.value / total) * 100}%` : 0,
                          backgroundColor: colors[s.key] ?? colors.Uncategorized,
                        }}
                        title={`${labels?.[s.key] ?? s.key}: ${format(s.value)}`}
                      />
                    ))}
                </div>
              );
            })}
          </div>

          {/* Month labels */}
          <div className="mt-1 flex gap-3">
            {data.map((d, i) => (
              <span
                key={d.label}
                className="min-w-[36px] flex-1 whitespace-pre text-center font-mono text-[10px] text-zinc-500"
              >
                {tickText[i]}
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
              style={{ backgroundColor: colors[key] ?? colors.Uncategorized }}
            />
            <span className="font-mono text-xs text-zinc-700">{labels?.[key] ?? key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
