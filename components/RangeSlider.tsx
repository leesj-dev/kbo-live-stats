"use client";

import { useCallback, useRef } from "react";

// Single track, two thumbs (start + end). Values are integers in [min, max].
export function RangeSlider({
  min,
  max,
  value,
  onChange,
  format,
  minGap = 1,
}: {
  min: number;
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  format: (v: number) => string;
  minGap?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeThumb = useRef<0 | 1 | null>(null);

  const [lo, hi] = value;
  const span = max - min || 1;
  const disabled = max <= min;
  const pct = (v: number) => ((v - min) / span) * 100;

  const clampThumb = useCallback(
    (thumb: 0 | 1, raw: number): [number, number] => {
      const v = Math.round(raw);
      if (thumb === 0) {
        return [Math.max(min, Math.min(v, hi - minGap)), hi];
      }
      return [lo, Math.min(max, Math.max(v, lo + minGap))];
    },
    [lo, hi, min, max, minGap],
  );

  const valueFromClientX = useCallback(
    (clientX: number) => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return min;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return min + ratio * span;
    },
    [min, span],
  );

  const onThumbDown =
    (thumb: 0 | 1) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      activeThumb.current = thumb;
    };

  const onThumbMove =
    (thumb: 0 | 1) => (e: React.PointerEvent<HTMLDivElement>) => {
      if (activeThumb.current !== thumb) return;
      onChange(clampThumb(thumb, valueFromClientX(e.clientX)));
    };

  const onThumbUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activeThumb.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  const onThumbKey =
    (thumb: 0 | 1) => (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step =
        e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -1
          : e.key === "ArrowRight" || e.key === "ArrowUp"
            ? 1
            : e.key === "Home"
              ? -span
              : e.key === "End"
                ? span
                : 0;
      if (step === 0) return;
      e.preventDefault();
      const cur = thumb === 0 ? lo : hi;
      onChange(clampThumb(thumb, cur + step));
    };

  const thumbProps = (thumb: 0 | 1, v: number) => ({
    role: "slider" as const,
    "aria-valuemin": min,
    "aria-valuemax": max,
    "aria-valuenow": v,
    "aria-valuetext": format(v),
    tabIndex: disabled ? -1 : 0,
    onPointerDown: onThumbDown(thumb),
    onPointerMove: onThumbMove(thumb),
    onPointerUp: onThumbUp,
    onKeyDown: onThumbKey(thumb),
    style: { left: `${pct(v)}%` },
    className:
      "absolute top-1/2 z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border border-[var(--color-line-strong)] bg-[var(--color-panel-2)] shadow-[0_1px_4px_rgba(0,0,0,0.5)] outline-none transition-colors hover:border-[var(--color-amber)] focus-visible:border-[var(--color-amber)] focus-visible:ring-2 focus-visible:ring-[var(--color-amber)]/40 active:cursor-grabbing active:border-[var(--color-amber)]",
  });

  const labelStyle = (v: number) =>
    ({
      left: `${pct(v)}%`,
      bottom: "calc(100% + 11px)",
    }) as const;

  return (
    <div className="select-none pt-7">
      <div className="relative flex h-4 items-center">
        <div
          ref={trackRef}
          className="relative h-1 w-full rounded-full bg-[var(--color-line)]"
        >
          <div
            className="absolute top-0 h-1 rounded-full bg-[var(--color-amber)]/70"
            style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
          />
          <span
            className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[12px] font-medium tabular-nums text-[var(--color-fg)]"
            style={labelStyle(lo)}
          >
            {format(lo)}
          </span>
          <span
            className="pointer-events-none absolute -translate-x-1/2 whitespace-nowrap text-[12px] font-medium tabular-nums text-[var(--color-fg)]"
            style={labelStyle(hi)}
          >
            {format(hi)}
          </span>
          <div {...thumbProps(0, lo)} aria-label="시작" />
          <div {...thumbProps(1, hi)} aria-label="종료" />
        </div>
      </div>
    </div>
  );
}
