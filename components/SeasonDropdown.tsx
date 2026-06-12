"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Season picker. The current view state (chart kind + axes) is carried in the
// query string so it survives season navigation.
export function SeasonDropdown({
  seasons,
  current,
  chartKind,
  xAxis,
  yAxis,
}: {
  seasons: number[];
  current: number;
  chartKind: string;
  xAxis: string;
  yAxis: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const seasonHref = useCallback(
    (season: number) => `/${season}?kind=${chartKind}&x=${xAxis}&y=${yAxis}`,
    [chartKind, xAxis, yAxis],
  );

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

  // Prefetch sibling seasons so navigation feels instant.
  useEffect(() => {
    if (open) {
      seasons.forEach((s) => router.prefetch(seasonHref(s)));
    }
  }, [open, seasons, router, seasonHref]);

  return (
    <div
      ref={ref}
      className="relative"
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] py-2 pl-3.5 pr-3 transition-colors hover:border-[var(--color-line-strong)]"
      >
        <span className="font-bold text-xl leading-none text-[var(--color-fg)]">{current}</span>
        <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--color-faint)]">시즌</span>
        <svg
          width="11"
          height="11"
          viewBox="0 0 12 12"
          fill="none"
          className={`text-[var(--color-muted)] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M2.5 4.5L6 8l3.5-3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="scroll-thin absolute right-0 z-30 mt-2 max-h-72 w-32 overflow-y-auto rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel-2)] p-1 shadow-2xl shadow-black/50"
        >
          {seasons.map((s) => {
            const active = s === current;
            return (
              <li key={s}>
                <button
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    setOpen(false);
                    if (!active) {
                      router.push(seasonHref(s));
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[13px] tabular-nums transition-colors ${
                    active
                      ? "bg-[var(--color-amber)] font-semibold text-[#1a1405]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
                  }`}
                >
                  {s}
                  {active && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                    >
                      <path
                        d="M2.5 6.5L5 9l4.5-5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
