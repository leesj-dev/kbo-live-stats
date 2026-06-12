"use client";

import { fmtYTick, type ChartGeometry, type XTick, type YAxis } from "@/lib/chart";

// Gridlines + tick labels shared by both charts. The zero-margin line (or the
// .500 line in win-rate mode) is drawn solid in amber as the baseline.
export function ChartAxes({
  geo,
  sx,
  sy,
  yTicks,
  xTicks,
  yAxis,
}: {
  geo: ChartGeometry;
  sx: (x: number) => number;
  sy: (y: number) => number;
  yTicks: number[];
  xTicks: XTick[];
  yAxis: YAxis;
}) {
  const { W, H, M, narrow } = geo;
  const tickSize = narrow ? 11 : 12.5;

  return (
    <>
      {yTicks.map((t) => {
        const y = sy(t);
        const isBaseline =
          (yAxis === "margin" && t === 0) || (yAxis === "winRate" && Math.abs(t - 0.5) < 1e-9);
        return (
          <g key={`y${t}`}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y}
              y2={y}
              stroke={isBaseline ? "rgba(244,194,13,0.35)" : "var(--color-line)"}
              strokeWidth={isBaseline ? 1.5 : 1}
              strokeDasharray={isBaseline ? "none" : "2 5"}
            />
            <text
              x={M.left - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="central"
              className="tnum"
              fontFamily="var(--font-sans)"
              fontSize={tickSize}
              fill={isBaseline ? "var(--color-amber)" : "var(--color-muted)"}
            >
              {fmtYTick(t, yAxis)}
            </text>
          </g>
        );
      })}

      {xTicks.map((t, i) => (
        <text
          key={`x${i}`}
          x={sx(t.x)}
          y={H - M.bottom + 24}
          textAnchor="middle"
          className="tnum"
          fontFamily="var(--font-sans)"
          fontSize={tickSize}
          fill="var(--color-muted)"
        >
          {t.label}
        </text>
      ))}
    </>
  );
}

// Dot + team name at the end of a series line.
export function SeriesEndLabel({
  x,
  y,
  color,
  team,
  highlighted,
  narrow,
  animate,
  delay,
}: {
  x: number;
  y: number;
  color: string;
  team: string;
  highlighted: boolean;
  narrow: boolean;
  animate: boolean;
  delay: number;
}) {
  return (
    <g
      className={animate ? "animate-rise" : undefined}
      style={animate ? { animationDelay: `${delay}s` } : undefined}
    >
      <circle
        cx={x}
        cy={y}
        r={highlighted ? 4 : 3}
        fill={color}
      />
      <text
        x={x + 7}
        y={y}
        dominantBaseline="central"
        fontFamily="var(--font-sans)"
        fontSize={narrow ? 10 : 11}
        fontWeight={highlighted ? 600 : 500}
        fill={color}
      >
        {team}
      </text>
    </g>
  );
}

// Vertical crosshair + point marker for the hovered position.
export function HoverMarker({
  px,
  py,
  color,
  geo,
  r = 5,
  strokeWidth = 1.5,
}: {
  px: number;
  py: number;
  color: string;
  geo: ChartGeometry;
  r?: number;
  strokeWidth?: number;
}) {
  return (
    <>
      <line
        x1={px}
        x2={px}
        y1={geo.M.top}
        y2={geo.H - geo.M.bottom}
        stroke="var(--color-line-strong)"
        strokeWidth={1}
      />
      <circle
        cx={px}
        cy={py}
        r={r}
        fill={color}
        stroke="var(--color-ink)"
        strokeWidth={strokeWidth}
      />
    </>
  );
}
