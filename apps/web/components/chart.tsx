"use client";
import { useState } from "react";
export type ChartPoint = { at: string; price: string; volume: string };
export function PriceChart({
  points,
  quote,
  symbol,
}: {
  points: ChartPoint[];
  quote: string;
  symbol: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  if (!points.length)
    return (
      <div className="chart-empty">
        <h3>No completed Alpha candles in this range</h3>
        <p>
          Start the collector with an eligible Alpha market pair. No synthetic
          price path is displayed.
        </p>
      </div>
    );
  const values = points.map((p) => Number(p.price)),
    volumes = points.map((p) => Number(p.volume));
  const min = Math.min(...values),
    max = Math.max(...values),
    span = max - min || max * 0.01 || 1,
    maxVolume = Math.max(...volumes) || 1;
  const times = points.map((p) => Date.parse(p.at));
  const timeSpan = Math.max(3600000, times.at(-1)! - times[0]);
  const segments: number[][] = [[]];
  times.forEach((t, i) => {
    if (i > 0 && t - times[i - 1] > 3600000) segments.push([]);
    segments.at(-1)!.push(i);
  });
  const x = (i: number) => 50 + ((times[i] - times[0]) / timeSpan) * 900,
    y = (v: number) => 205 - ((v - min) / span) * 170;
  const active = points[selected ?? points.length - 1];
  return (
    <div className="chart">
      <div className="chart-readout">
        <strong>
          {Number(active.price).toLocaleString("en-US", {
            maximumSignificantDigits: 8,
          })}{" "}
          <span>{quote}</span>
        </strong>
        <span>
          {new Date(active.at)
            .toISOString()
            .replace("T", " ")
            .replace(".000Z", " UTC")}
        </span>
        <span>
          Base volume{" "}
          {Number(active.volume).toLocaleString("en-US", {
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <svg
        viewBox="0 0 1000 290"
        role="img"
        aria-label={`${symbol} completed hourly candle close prices and base volume, ${quote}`}
        onPointerMove={(e) => {
          const b = e.currentTarget.getBoundingClientRect();
          const target =
            times[0] +
            ((((e.clientX - b.left) / b.width) * 1000 - 50) / 900) * timeSpan;
          const idx = times.reduce(
            (best, t, i) =>
              Math.abs(t - target) < Math.abs(times[best] - target) ? i : best,
            0,
          );
          setSelected(idx);
        }}
        onPointerLeave={() => setSelected(null)}
      >
        <title>{symbol} Alpha hourly close price and volume</title>
        {[0, 0.5, 1].map((k) => (
          <g key={k}>
            <line
              className="chart-grid"
              x1="50"
              x2="950"
              y1={35 + k * 170}
              y2={35 + k * 170}
            />
            <text className="chart-label" x="955" y={39 + k * 170}>
              {(max - k * span).toPrecision(3)}
            </text>
          </g>
        ))}
        {volumes.map((v, i) => (
          <rect
            key={i}
            className="chart-volume"
            x={x(i) - 1}
            y={265 - (v / maxVolume) * 38}
            width={Math.max(1, 850 / points.length)}
            height={(v / maxVolume) * 38}
          />
        ))}
        {segments.map((segment, n) => (
          <polyline
            key={n}
            className="chart-line"
            points={segment.map((i) => `${x(i)},${y(values[i])}`).join(" ")}
          />
        ))}
        {selected !== null ? (
          <g>
            <line
              className="chart-crosshair"
              x1={x(selected)}
              x2={x(selected)}
              y1="25"
              y2="265"
            />
            <circle
              className="chart-point"
              cx={x(selected)}
              cy={y(values[selected])}
              r="4"
            />
          </g>
        ) : null}
        <text className="chart-label" x="50" y="285">
          {new Date(points[0].at).toISOString().slice(0, 10)}
        </text>
        <text className="chart-label" x="850" y="285">
          {new Date(points.at(-1)!.at).toISOString().slice(0, 10)}
        </text>
      </svg>
      <label className="chart-control">
        Inspect candle
        <input
          aria-label="Inspect candle by time"
          type="range"
          min={0}
          max={points.length - 1}
          value={selected ?? points.length - 1}
          onChange={(e) => setSelected(Number(e.target.value))}
        />
      </label>
      <p className="muted">
        Source: Binance Alpha {symbol}. Completed hourly closes; volume in base
        units. Last {points.length} available candles in this range.{" "}
        {segments.length - 1} observed gaps are left disconnected; no executable
        fill is implied.
      </p>
    </div>
  );
}
