"use client";

import { useEffect, useRef, useState } from "react";

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const SUN = "#f0584e";
const SAT = "#4c8dff";
const pad = (n: number) => String(n).padStart(2, "0");
const ymdToDash = (ymd: string) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

// shadcn-style date picker: a clickable date label that opens a calendar popover.
// Only dates with games (`dates`) are selectable; the rest are dimmed.
export function DatePicker({
  value,
  label,
  dates,
  onSelect,
  todayYmd,
}: {
  value: string; // YYYYMMDD (selected)
  label: string; // trigger text
  dates: string[]; // selectable dates, YYYY-MM-DD
  onSelect: (ymd: string) => void;
  todayYmd: string; // YYYYMMDD
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => ({ y: Number(value.slice(0, 4)), m: Number(value.slice(4, 6)) - 1 }));
  const ref = useRef<HTMLDivElement>(null);

  // Open to the selected date's month each time the popover opens.
  useEffect(() => {
    if (open) setView({ y: Number(value.slice(0, 4)), m: Number(value.slice(4, 6)) - 1 });
  }, [open, value]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const enabled = new Set(dates);
  const minKey = dates.length ? Number(dates[0].slice(0, 4)) * 12 + (Number(dates[0].slice(5, 7)) - 1) : -Infinity;
  const maxKey = dates.length ? Number(dates[dates.length - 1].slice(0, 4)) * 12 + (Number(dates[dates.length - 1].slice(5, 7)) - 1) : Infinity;
  const curKey = view.y * 12 + view.m;

  const shiftMonth = (delta: number) => {
    let m = view.m + delta;
    let y = view.y;
    if (m < 0) {
      m = 11;
      y--;
    } else if (m > 11) {
      m = 0;
      y++;
    }
    setView({ y, m });
  };

  // Build the month grid (leading blanks + days, padded to full weeks).
  const startWeekday = new Date(Date.UTC(view.y, view.m, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: ({ d: number; dash: string } | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, dash: `${view.y}-${pad(view.m + 1)}-${pad(d)}` });
  while (cells.length % 7 !== 0) cells.push(null);

  const valueDash = ymdToDash(value);
  const todayDash = ymdToDash(todayYmd);

  return (
    <div
      ref={ref}
      className="relative flex min-w-[160px] flex-col items-center"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="cursor-pointer rounded-lg px-2.5 py-1 text-[17px] font-bold text-[var(--color-fg)] transition-colors hover:bg-[var(--color-panel-2)]/60"
      >
        {label}
      </button>

      {open && (
        <div className="absolute left-1/2 top-[calc(100%+8px)] z-50 -translate-x-1/2 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel-2)] p-3 shadow-xl">
          <div className="mb-2 flex items-center justify-between">
            <MonthArrow
              dir="prev"
              disabled={curKey <= minKey}
              onClick={() => shiftMonth(-1)}
            />
            <span className="tnum text-[13px] font-semibold text-[var(--color-fg)]">
              {view.y}년 {view.m + 1}월
            </span>
            <MonthArrow
              dir="next"
              disabled={curKey >= maxKey}
              onClick={() => shiftMonth(1)}
            />
          </div>

          <div
            className="grid gap-0.5"
            style={{ gridTemplateColumns: "repeat(7, 2.25rem)" }}
          >
            {WEEK.map((w, i) => (
              <div
                key={w}
                className="flex h-7 w-9 items-center justify-center text-[11px] font-medium"
                style={{ color: i === 0 ? SUN : i === 6 ? SAT : "var(--color-muted)" }}
              >
                {w}
              </div>
            ))}
            {cells.map((c, i) => {
              if (!c)
                return (
                  <div
                    key={i}
                    className="h-9 w-9"
                  />
                );
              const isEnabled = enabled.has(c.dash);
              const isSelected = c.dash === valueDash;
              const isToday = c.dash === todayDash;
              return (
                <button
                  key={i}
                  disabled={!isEnabled}
                  onClick={() => {
                    onSelect(c.dash.replace(/-/g, ""));
                    setOpen(false);
                  }}
                  className={`tnum flex h-9 w-9 items-center justify-center rounded-md text-[12.5px] transition-colors ${
                    isSelected ? "font-bold" : ""
                  } ${isEnabled ? "cursor-pointer text-[var(--color-fg)] hover:bg-[var(--color-panel)]" : "cursor-default text-[var(--color-muted)] opacity-35"}`}
                  style={
                    isSelected
                      ? { background: "var(--color-fg)", color: "var(--color-panel-2)" }
                      : isToday && isEnabled
                        ? { boxShadow: "inset 0 0 0 1px var(--color-line-strong)" }
                        : undefined
                  }
                >
                  {c.d}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MonthArrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "이전 달" : "다음 달"}
      className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)] disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {dir === "prev" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </button>
  );
}
