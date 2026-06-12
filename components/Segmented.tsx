"use client";

import type { ReactNode } from "react";

// Labeled segmented control (pill buttons), used for the chart/axis toggles.
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  info,
}: {
  value: T;
  options: { value: T; label: string; disabled?: boolean }[];
  onChange: (v: T) => void;
  label: string;
  info?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-[5px]">
      <span className="flex items-center gap-1 ml-1 text-[12px] text-[var(--color-muted)]">
        {label}
        {info}
      </span>
      <div className="inline-flex rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-0.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              onClick={() => !o.disabled && onChange(o.value)}
              disabled={o.disabled}
              className={`relative rounded-[6px] px-3 sm:px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                active
                  ? "bg-[var(--color-panel-2)] text-[var(--color-fg)] shadow-[inset_0_0_0_1px_var(--color-line-strong)]"
                  : o.disabled
                    ? "cursor-not-allowed text-[var(--color-muted)]/40"
                    : "text-[var(--color-muted)] hover:text-[var(--color-fg)]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
